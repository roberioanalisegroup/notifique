import { getSupabaseForRequest } from "@/lib/api-auth";
import { logCompanyHistory } from "@/lib/company-history";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/alvara-tasks/[id]/force-complete
 * Body: { reason: string }   (obrigatório — justificativa administrativa)
 *
 * Força o encerramento administrativo de uma tarefa de alvará.
 * Restrito a admin.
 * Não executa a RPC transacional de renovação — apenas cancela a tarefa
 * com motivo administrativo e registra em company_history.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  // 1. Verificar permissão (somente admin)
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = prof?.role || "user";
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Acesso não autorizado. Somente administradores podem realizar o Encerramento Administrativo de tarefas." },
      { status: 403 }
    );
  }

  // 2. Parse do body
  let body: { reason: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.reason || body.reason.trim().length < 10) {
    return NextResponse.json(
      { error: "É obrigatório informar uma justificativa de Encerramento Administrativo com no mínimo 10 caracteres." },
      { status: 400 }
    );
  }

  // 3. Buscar tarefa
  const { data: task, error: taskErr } = await supabase
    .from("alvara_tasks")
    .select("id, status, company_alvara_id")
    .eq("id", taskId)
    .maybeSingle();

  if (taskErr) {
    return NextResponse.json({ error: taskErr.message }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  // 4. Validação: não encerrar tarefas já concluídas/canceladas
  if (task.status === "concluida" || task.status === "cancelada") {
    return NextResponse.json(
      { error: `Tarefa já está ${task.status} e não pode sofrer Encerramento Administrativo novamente.` },
      { status: 400 }
    );
  }

  // 5. Buscar dados do vínculo para auditoria
  const { data: link } = await supabase
    .from("company_alvaras")
    .select("company_id, alvaras(name)")
    .eq("id", task.company_alvara_id)
    .maybeSingle();

  const alvaraNome = (link as any)?.alvaras?.name || "Alvará";

  // 6. Encerrar tarefa (cancelar com motivo administrativo)
  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("alvara_tasks")
    .update({
      status: "cancelada",
      cancelled_at: now,
      cancelled_by: userId,
      cancellation_reason: `[Encerramento Administrativo] ${body.reason.trim()}`,
      updated_at: now,
    })
    .eq("id", taskId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // 7. Registrar no histórico da tarefa
  await supabase.from("alvara_task_history").insert({
    task_id: taskId,
    event_type: "status",
    summary: `Encerramento Administrativo realizado. Motivo: ${body.reason.trim()}`,
    from_status: task.status,
    to_status: "cancelada",
    created_by: userId,
    metadata: {
      tipo: "force_complete",
      motivo: body.reason.trim(),
      encerrado_por: userId,
    },
  });

  // 8. Registrar em company_history
  if (link?.company_id) {
    await logCompanyHistory(supabase, {
      companyId: link.company_id,
      eventType: "company_alvara_task_force_completed",
      summary: `Tarefa de "${alvaraNome}" encerrada administrativamente. Motivo: ${body.reason.trim()}`,
      metadata: {
        company_alvara_id: task.company_alvara_id,
        task_id: taskId,
        motivo: body.reason.trim(),
        status_anterior: task.status,
      },
      actorUserId: userId,
    });
  }

  return NextResponse.json({ ok: true, status: "cancelada" });
}

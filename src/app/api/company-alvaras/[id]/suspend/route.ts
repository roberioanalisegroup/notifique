import { getSupabaseForRequest } from "@/lib/api-auth";
import { logCompanyHistory } from "@/lib/company-history";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/company-alvaras/[id]/suspend
 * Body: { action: "suspend" | "reactivate", reason?: string }
 *
 * Suspende ou reativa o monitoramento de um vínculo.
 * Restrito a admin / gestor.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  // 1. Verificar permissão (admin ou gestor)
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = prof?.role || "user";
  if (role !== "admin" && role !== "gestor") {
    return NextResponse.json(
      { error: "Acesso não autorizado. Somente admin e gestor podem alterar o monitoramento." },
      { status: 403 }
    );
  }

  // 2. Parse do body
  let body: { action: "suspend" | "reactivate"; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!["suspend", "reactivate"].includes(body.action)) {
    return NextResponse.json({ error: "action deve ser 'suspend' ou 'reactivate'" }, { status: 400 });
  }

  // 3. Buscar vínculo atual
  const { data: link, error: linkErr } = await supabase
    .from("company_alvaras")
    .select("id, company_id, monitoring_status, alvaras(name)")
    .eq("id", id)
    .maybeSingle();

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }
  if (!link) {
    return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
  }

  const newMonitoringStatus = body.action === "suspend" ? "suspenso" : "ativo";
  const alvaraNome = (link as any).alvaras?.name || "Alvará";

  // 4. Verificar idempotência
  if (link.monitoring_status === newMonitoringStatus) {
    return NextResponse.json(
      {
        ok: true,
        message: `Monitoramento já está ${newMonitoringStatus}.`,
        monitoring_status: newMonitoringStatus,
      },
      { status: 200 }
    );
  }

  // 5. Atualizar o campo monitoring_status
  const { error: updateErr } = await supabase
    .from("company_alvaras")
    .update({
      monitoring_status: newMonitoringStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // 6. Registrar auditoria
  const eventType =
    body.action === "suspend"
      ? "company_alvara_monitoring_suspended"
      : "company_alvara_monitoring_reactivated";

  const summary =
    body.action === "suspend"
      ? `Monitoramento suspenso para o alvará "${alvaraNome}"${body.reason ? `: ${body.reason}` : "."}`
      : `Monitoramento reativado para o alvará "${alvaraNome}"${body.reason ? `: ${body.reason}` : "."}`;

  await logCompanyHistory(supabase, {
    companyId: link.company_id,
    eventType,
    summary,
    metadata: {
      company_alvara_id: id,
      de: link.monitoring_status,
      para: newMonitoringStatus,
      motivo: body.reason || null,
    },
    actorUserId: userId,
  });

  return NextResponse.json({
    ok: true,
    monitoring_status: newMonitoringStatus,
  });
}

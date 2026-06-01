import { getSupabaseForRequest } from "@/lib/api-auth";
import { logCompanyHistory } from "@/lib/company-history";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/company-alvaras/[id]/archive-link
 * Body: { action: "archive" | "restore", reason?: string }
 *
 * Arquiva ou restaura um vínculo de alvará.
 * Restrito a admin / gestor.
 *
 * Arquivar: seta archived_at = now()
 * Restaurar: seta archived_at = null
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
      { error: "Acesso não autorizado. Somente admin e gestor podem arquivar/restaurar vínculos." },
      { status: 403 }
    );
  }

  // 2. Parse do body
  let body: { action: "archive" | "restore"; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!["archive", "restore"].includes(body.action)) {
    return NextResponse.json({ error: "action deve ser 'archive' ou 'restore'" }, { status: 400 });
  }

  // 3. Buscar vínculo atual
  const { data: link, error: linkErr } = await supabase
    .from("company_alvaras")
    .select("id, company_id, archived_at, alvaras(name)")
    .eq("id", id)
    .maybeSingle();

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }
  if (!link) {
    return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
  }

  const alvaraNome = (link as any).alvaras?.name || "Alvará";
  const alreadyArchived = !!link.archived_at;

  // 4. Verificar idempotência
  if (body.action === "archive" && alreadyArchived) {
    return NextResponse.json({ ok: true, message: "Vínculo já está arquivado.", archived_at: link.archived_at }, { status: 200 });
  }
  if (body.action === "restore" && !alreadyArchived) {
    return NextResponse.json({ ok: true, message: "Vínculo não está arquivado.", archived_at: null }, { status: 200 });
  }

  // 5. Atualizar
  const newArchivedAt = body.action === "archive" ? new Date().toISOString() : null;
  const { error: updateErr } = await supabase
    .from("company_alvaras")
    .update({
      archived_at: newArchivedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // 6. Registrar auditoria
  const eventType =
    body.action === "archive"
      ? "company_alvara_archived"
      : "company_alvara_restored";

  const summary =
    body.action === "archive"
      ? `Vínculo arquivado: "${alvaraNome}"${body.reason ? ` — ${body.reason}` : "."}`
      : `Vínculo restaurado: "${alvaraNome}"${body.reason ? ` — ${body.reason}` : "."}`;

  await logCompanyHistory(supabase, {
    companyId: link.company_id,
    eventType,
    summary,
    metadata: {
      company_alvara_id: id,
      motivo: body.reason || null,
    },
    actorUserId: userId,
  });

  return NextResponse.json({
    ok: true,
    archived_at: newArchivedAt,
  });
}

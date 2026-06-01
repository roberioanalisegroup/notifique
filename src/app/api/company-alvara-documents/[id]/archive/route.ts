import { getSupabaseForRequest } from "@/lib/api-auth";
import { logCompanyHistory } from "@/lib/company-history";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/company-alvara-documents/[id]/archive
 * Body: { action: "archive" | "restore", reason?: string }
 *
 * Arquiva ou restaura um documento histórico de vínculo de alvará.
 * Restrito a admin / gestor.
 * Documentos vigentes (is_current=true) não podem ser arquivados diretamente.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: docId } = await params;
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
      { error: "Acesso não autorizado. Somente admin e gestor podem arquivar/restaurar documentos." },
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

  // 3. Buscar documento
  const { data: doc, error: docErr } = await supabase
    .from("company_alvara_documents")
    .select("id, company_alvara_id, is_current, archived_at, file_name, issue_date")
    .eq("id", docId)
    .maybeSingle();

  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  }

  // 4. Validação: não arquivar documento vigente
  if (body.action === "archive" && doc.is_current) {
    return NextResponse.json(
      {
        error:
          "O documento vigente não pode ser arquivado diretamente. Substitua-o por um novo documento primeiro.",
      },
      { status: 400 }
    );
  }

  // 5. Verificar idempotência
  if (body.action === "archive" && doc.archived_at) {
    return NextResponse.json({ ok: true, message: "Documento já está arquivado.", archived_at: doc.archived_at });
  }
  if (body.action === "restore" && !doc.archived_at) {
    return NextResponse.json({ ok: true, message: "Documento não está arquivado.", archived_at: null });
  }

  // 6. Buscar company_id para auditoria
  const { data: link } = await supabase
    .from("company_alvaras")
    .select("company_id")
    .eq("id", doc.company_alvara_id)
    .maybeSingle();

  const newArchivedAt = body.action === "archive" ? new Date().toISOString() : null;

  // 7. Atualizar documento
  const { error: updateErr } = await supabase
    .from("company_alvara_documents")
    .update({
      archived_at: newArchivedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // 8. Registrar no histórico de documentos
  const docEventType = body.action === "archive" ? "document_archived" : "document_restored";
  const docEventDesc =
    body.action === "archive"
      ? `Documento arquivado (emissão: ${doc.issue_date || "—"})${body.reason ? ` — ${body.reason}` : "."}`
      : `Documento restaurado (emissão: ${doc.issue_date || "—"})${body.reason ? ` — ${body.reason}` : "."}`;

  await supabase.from("company_alvara_document_history").insert({
    company_alvara_id: doc.company_alvara_id,
    document_id: docId,
    event_type: docEventType,
    description: docEventDesc,
    created_by: userId,
    metadata: { motivo: body.reason || null },
  });

  // 9. Registrar em company_history (auditoria geral)
  if (link?.company_id) {
    const compEventType =
      body.action === "archive"
        ? "company_alvara_document_archived"
        : "company_alvara_document_restored";

    await logCompanyHistory(supabase, {
      companyId: link.company_id,
      eventType: compEventType,
      summary: docEventDesc,
      metadata: {
        company_alvara_id: doc.company_alvara_id,
        document_id: docId,
        file_name: doc.file_name || null,
        motivo: body.reason || null,
      },
      actorUserId: userId,
    });
  }

  return NextResponse.json({
    ok: true,
    archived_at: newArchivedAt,
  });
}

import { getSupabaseForRequest } from "@/lib/api-auth";
import { logCompanyHistory } from "@/lib/company-history";
import type { Alvara, AlvaraGroup, Company, CompanyAlvara } from "@/types";
import { NextRequest, NextResponse } from "next/server";

type Row = CompanyAlvara & {
  alvaras: Alvara & { alvara_groups: AlvaraGroup };
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(_request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (cErr || !company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  const { data: links, error: lErr } = await supabase
    .from("company_alvaras")
    .select(
      `
      *,
      alvaras (
        *,
        alvara_groups (*)
      )
    `
    )
    .eq("company_id", id)
    .order("data_vencimento", { ascending: true, nullsFirst: false });

  if (lErr) {
    return NextResponse.json(
      { error: lErr.message, company, company_alvaras: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({
    company: company as Company,
    company_alvaras: (links ?? []) as unknown as Row[],
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: { archived?: boolean; codigo_empresa?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const hasArchived = typeof body.archived === "boolean";
  const hasCodigo = Object.prototype.hasOwnProperty.call(body, "codigo_empresa");

  if (!hasArchived && !hasCodigo) {
    return NextResponse.json(
      {
        error:
          'Envie { "archived": true|false } para arquivar/restaurar e/ou { "codigo_empresa": "texto" } para o código interno.',
      },
      { status: 400 }
    );
  }

  if (hasCodigo && body.codigo_empresa != null && typeof body.codigo_empresa !== "string") {
    return NextResponse.json(
      { error: "codigo_empresa deve ser texto ou null" },
      { status: 400 }
    );
  }

  const actorUserId = auth.isServiceRole ? null : auth.userId;

  let previousCodigo: string | null = null;
  if (hasCodigo) {
    const { data: prevRow } = await supabase
      .from("companies")
      .select("codigo_empresa")
      .eq("id", id)
      .maybeSingle();
    previousCodigo =
      prevRow?.codigo_empresa != null && String(prevRow.codigo_empresa).trim() !== ""
        ? String(prevRow.codigo_empresa).trim()
        : null;
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  if (hasArchived) {
    patch.archived_at = body.archived ? now : null;
  }
  let nextCodigo: string | null = null;
  if (hasCodigo) {
    const raw = body.codigo_empresa;
    const trimmed = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
    nextCodigo = trimmed === "" ? null : trimmed;
    patch.codigo_empresa = nextCodigo;
  }

  const { data, error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  if (hasArchived) {
    await logCompanyHistory(supabase, {
      companyId: id,
      eventType: body.archived ? "arquivamento" : "restauracao",
      summary: body.archived
        ? "Empresa arquivada (sai da lista principal)."
        : "Empresa restaurada à lista principal.",
      actorUserId,
    });
  }

  if (hasCodigo) {
    const fmt = (v: string | null) => (v == null || v === "" ? "—" : v);
    const changed = previousCodigo !== nextCodigo;
    if (changed) {
      await logCompanyHistory(supabase, {
        companyId: id,
        eventType: "codigo_empresa_atualizado",
        summary: `Código da empresa alterado de «${fmt(previousCodigo)}» para «${fmt(nextCodigo)}».`,
        metadata: { anterior: previousCodigo, novo: nextCodigo },
        actorUserId,
      });
    }
  }

  return NextResponse.json({ company: data as Company });
}

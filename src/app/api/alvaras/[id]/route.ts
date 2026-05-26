import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  isAlvaraFrequencia,
  isWeekendAdjust,
  validateLegalForFrequencia,
  type AlvaraLegalDates,
} from "@/lib/alvara-frequency";
import type { Alvara } from "@/types";
import { NextRequest, NextResponse } from "next/server";

async function resolveRouteId(
  params: Promise<{ id: string }> | { id: string }
): Promise<string | null> {
  const p = await Promise.resolve(params);
  const id = p?.id?.trim();
  return id || null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const id = await resolveRouteId(context.params);
  if (!id) {
    return NextResponse.json({ error: "ID do alvará inválido" }, { status: 400 });
  }

  let body: Partial<Alvara>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.frequencia != null && !isAlvaraFrequencia(body.frequencia)) {
    return NextResponse.json({ error: "Frequência inválida" }, { status: 400 });
  }
  if (body.weekend_adjust != null && !isWeekendAdjust(body.weekend_adjust)) {
    return NextResponse.json({ error: "Ajuste de fim de semana inválido" }, { status: 400 });
  }
  if (body.prazo_inicio_dias !== undefined && body.prazo_inicio_dias !== null) {
    const p = Number(body.prazo_inicio_dias);
    if (!Number.isFinite(p) || p < 1 || p > 3650) {
      return NextResponse.json(
        { error: "prazo_inicio_dias deve estar entre 1 e 3650." },
        { status: 400 }
      );
    }
  }
  if (body.anexo_obrigatorio !== undefined && body.anexo_obrigatorio !== null) {
    if (typeof body.anexo_obrigatorio !== "boolean") {
      return NextResponse.json({ error: "anexo_obrigatorio deve ser booleano." }, { status: 400 });
    }
  }

  const { data: current, error: curErr } = await supabase
    .from("alvaras")
    .select("frequencia, legal_dia, legal_mes, legal_dia_semana, legal_dias_uteis, dias_frequencia_personalizada")
    .eq("id", id)
    .maybeSingle();

  if (curErr) {
    return NextResponse.json(
      {
        error: curErr.message,
        hint:
          curErr.message?.includes("legal_dia") || curErr.message?.includes("legal_mes")
            ? "Execute no Supabase a migração supabase/migrations/alvaras_legal_dates.sql"
            : undefined,
      },
      { status: 500 }
    );
  }

  if (!current) {
    return NextResponse.json({ error: "Tipo de alvará não encontrado" }, { status: 404 });
  }

  const mergedFreq = (body.frequencia ?? current.frequencia) as string;
  if (!isAlvaraFrequencia(mergedFreq)) {
    return NextResponse.json({ error: "Frequência inválida" }, { status: 400 });
  }

  if (mergedFreq === "personalizada") {
    const dias = body.dias_frequencia_personalizada !== undefined
      ? body.dias_frequencia_personalizada
      : (current as any).dias_frequencia_personalizada;
    if (dias == null || dias <= 0) {
      return NextResponse.json({ error: "Frequência personalizada exige preenchimento da quantidade de dias." }, { status: 400 });
    }
  }

  const legal: AlvaraLegalDates = {
    legal_dia: (body.legal_dia !== undefined ? body.legal_dia : current.legal_dia) ?? null,
    legal_mes: (body.legal_mes !== undefined ? body.legal_mes : current.legal_mes) ?? null,
    legal_dia_semana:
      (body.legal_dia_semana !== undefined ? body.legal_dia_semana : current.legal_dia_semana) ??
      null,
    legal_dias_uteis:
      (body.legal_dias_uteis !== undefined ? body.legal_dias_uteis : current.legal_dias_uteis) ??
      null,
  };
  const legalErr = validateLegalForFrequencia(mergedFreq, legal);
  if (legalErr) {
    return NextResponse.json({ error: legalErr }, { status: 400 });
  }

  const { id: _bodyId, created_at: _c, updated_at: _u, ...patchBody } = body as Partial<Alvara> & {
    created_at?: string;
    updated_at?: string;
  };

  const selectPatch = `*, alvara_groups ( id, name, color )`;
  const ts = new Date().toISOString();

  let updatePayload: Record<string, unknown> = { ...patchBody, updated_at: ts };
  if (body.frequencia && body.frequencia !== "personalizada") {
    updatePayload.dias_frequencia_personalizada = null;
  }
  let { data, error } = await supabase
    .from("alvaras")
    .update(updatePayload)
    .eq("id", id)
    .select(selectPatch)
    .single();

  if (
    error?.message?.includes("anexo_obrigatorio") &&
    error.message.includes("does not exist") &&
    Object.prototype.hasOwnProperty.call(patchBody, "anexo_obrigatorio")
  ) {
    const { anexo_obrigatorio: _drop, ...rest } = patchBody as Record<string, unknown>;
    updatePayload = { ...rest, updated_at: ts };
    const r2 = await supabase.from("alvaras").update(updatePayload).eq("id", id).select(selectPatch).single();
    data = r2.data;
    error = r2.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ alvara: data });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const id = await resolveRouteId(context.params);
  if (!id) {
    return NextResponse.json({ error: "ID do alvará inválido" }, { status: 400 });
  }

  const { count } = await supabase
    .from("company_alvaras")
    .select("id", { count: "exact", head: true })
    .eq("alvara_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Não é possível excluir: existem vínculos com empresas" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("alvaras").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

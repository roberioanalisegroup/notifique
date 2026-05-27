import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  isAlvaraFrequencia,
  isWeekendAdjust,
  validateLegalForFrequencia,
  type AlvaraLegalDates,
} from "@/lib/alvara-frequency";
import type { Alvara } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const groupId = request.nextUrl.searchParams.get("group_id");
  const semGrupo = request.nextUrl.searchParams.get("sem_grupo");
  const onlyActive = request.nextUrl.searchParams.get("only_active") === "true";
  let q = supabase
    .from("alvaras")
    .select(
      `
      *,
      alvara_groups ( id, name, color )
    `
    )
    .order("name", { ascending: true });

  if (semGrupo === "1" || semGrupo === "true") {
    q = q.is("group_id", null);
  } else if (groupId) {
    q = q.eq("group_id", groupId);
  }

  if (onlyActive) {
    q = q.eq("is_active", true);
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message, alvaras: [] }, { status: 500 });
  }

  const rows = data as { id: string }[] | null;
  if (!rows?.length) {
    return NextResponse.json({ alvaras: [] });
  }

  const ids = rows.map((a) => a.id);
  const { data: linkRows, error: linkErr } = await supabase
    .from("company_alvaras")
    .select("alvara_id")
    .in("alvara_id", ids);

  if (linkErr) {
    return NextResponse.json(
      { error: linkErr.message, alvaras: [] },
      { status: 500 }
    );
  }

  const countMap = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const row of linkRows ?? []) {
    const id = (row as { alvara_id: string }).alvara_id;
    countMap.set(id, (countMap.get(id) ?? 0) + 1);
  }

  const withCounts = rows.map((a) => ({
    ...a,
    vinculados: countMap.get(a.id) ?? 0,
  }));

  return NextResponse.json({ alvaras: withCounts });
}

export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: {
    group_id?: string;
    name?: string;
    description?: string | null;
    orgao_emissor?: string | null;
    frequencia?: string;
    weekend_adjust?: string;
    legal_dia?: number | null;
    legal_mes?: number | null;
    legal_dia_semana?: number | null;
    legal_dias_uteis?: number | null;
    prazo_inicio_dias?: number;
    anexo_obrigatorio?: boolean;
    is_active?: boolean;
    dias_frequencia_personalizada?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const frequencia = body.frequencia ?? "mensal";
  const weekend_adjust = body.weekend_adjust ?? "none";
  if (!isAlvaraFrequencia(frequencia)) {
    return NextResponse.json({ error: "Frequência inválida" }, { status: 400 });
  }
  if (!isWeekendAdjust(weekend_adjust)) {
    return NextResponse.json({ error: "Ajuste de fim de semana inválido" }, { status: 400 });
  }

  if (frequencia === "personalizada" && (body.dias_frequencia_personalizada == null || body.dias_frequencia_personalizada <= 0)) {
    return NextResponse.json({ error: "Frequência personalizada exige preenchimento da quantidade de dias." }, { status: 400 });
  }

  let prazo_inicio = 30;
  if (body.prazo_inicio_dias !== undefined && body.prazo_inicio_dias !== null) {
    prazo_inicio = Number(body.prazo_inicio_dias);
    if (!Number.isFinite(prazo_inicio) || prazo_inicio < 1 || prazo_inicio > 3650) {
      return NextResponse.json(
        { error: "prazo_inicio_dias deve estar entre 1 e 3650." },
        { status: 400 }
      );
    }
  }

  const legal: AlvaraLegalDates = {
    legal_dia: body.legal_dia ?? null,
    legal_mes: body.legal_mes ?? null,
    legal_dia_semana: body.legal_dia_semana ?? null,
    legal_dias_uteis: body.legal_dias_uteis ?? null,
  };
  const legalErr = validateLegalForFrequencia(frequencia, legal);
  if (legalErr) {
    return NextResponse.json({ error: legalErr }, { status: 400 });
  }

  const group_id =
    body.group_id && String(body.group_id).trim() !== "" ? String(body.group_id).trim() : null;

  const rowBase = {
    group_id,
    name: body.name.trim(),
    description: body.description ?? null,
    orgao_emissor: body.orgao_emissor ?? null,
    frequencia,
    weekend_adjust,
    legal_dia: legal.legal_dia,
    legal_mes: legal.legal_mes,
    legal_dia_semana: legal.legal_dia_semana,
    legal_dias_uteis: legal.legal_dias_uteis,
    prazo_inicio_dias: prazo_inicio,
    is_active: body.is_active ?? true,
    dias_frequencia_personalizada: frequencia === "personalizada" ? body.dias_frequencia_personalizada : null,
  };

  const selectAlvara = `*, alvara_groups ( id, name, color )`;

  let { data, error } = await supabase
    .from("alvaras")
    .insert({
      ...rowBase,
      anexo_obrigatorio: body.anexo_obrigatorio === true,
    })
    .select(selectAlvara)
    .single();

  if (
    error?.message?.includes("anexo_obrigatorio") &&
    error.message.includes("does not exist")
  ) {
    const r2 = await supabase.from("alvaras").insert(rowBase).select(selectAlvara).single();
    data = r2.data;
    error = r2.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ alvara: { ...data, vinculados: 0 } as Alvara & { vinculados: number } });
}

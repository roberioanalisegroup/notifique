import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  computeDataVencimentoISO,
  isAlvaraFrequencia,
  isWeekendAdjust,
} from "@/lib/alvara-frequency";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };

  const vencimentoExplicito = Object.prototype.hasOwnProperty.call(body, "data_vencimento");
  if (body.data_emissao && typeof body.data_emissao === "string" && !vencimentoExplicito) {
    const { data: row, error: rowErr } = await supabase
      .from("company_alvaras")
      .select("alvara_id")
      .eq("id", params.id)
      .single();
    if (!rowErr && row?.alvara_id) {
      const { data: av } = await supabase
        .from("alvaras")
        .select("frequencia, weekend_adjust, legal_dia, legal_mes, legal_dia_semana, legal_dias_uteis")
        .eq("id", row.alvara_id)
        .single();
      if (av && isAlvaraFrequencia(av.frequencia) && isWeekendAdjust(av.weekend_adjust)) {
        try {
          patch.data_vencimento = computeDataVencimentoISO(
            body.data_emissao,
            av.frequencia,
            av.weekend_adjust,
            {
              legal_dia: av.legal_dia ?? null,
              legal_mes: av.legal_mes ?? null,
              legal_dia_semana: av.legal_dia_semana ?? null,
              legal_dias_uteis: av.legal_dias_uteis ?? null,
            }
          );
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Data de emissão inválida" },
            { status: 400 }
          );
        }
      }
    }
  }

  const { data, error } = await supabase
    .from("company_alvaras")
    .update(patch)
    .eq("id", params.id)
    .select(
      `
      *,
      alvaras ( *, alvara_groups ( * ) )
    `
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ company_alvara: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { error } = await supabase
    .from("company_alvaras")
    .delete()
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

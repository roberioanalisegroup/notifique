import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  computeDataVencimentoISO,
  isAlvaraFrequencia,
  isWeekendAdjust,
} from "@/lib/alvara-frequency";
import type { CompanyAlvara } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const companyId = request.nextUrl.searchParams.get("company_id");
  const alvaraId = request.nextUrl.searchParams.get("alvara_id");

  let q = supabase
    .from("company_alvaras")
    .select(
      `
      *,
      alvaras ( *, alvara_groups ( * ) ),
      companies ( id, cnpj, razao_social )
    `
    )
    .order("data_vencimento", { ascending: true, nullsFirst: false });

  if (companyId) q = q.eq("company_id", companyId);
  if (alvaraId) q = q.eq("alvara_id", alvaraId);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: error.message, company_alvaras: [] },
      { status: 500 }
    );
  }
  return NextResponse.json({ company_alvaras: data as CompanyAlvara[] });
}

export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: {
    company_id?: string;
    alvara_id?: string;
    numero?: string | null;
    data_emissao?: string | null;
    data_vencimento?: string | null;
    data_notificacao?: string | null;
    status?: string;
    observacoes?: string | null;
    arquivo_url?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.company_id || !body.alvara_id) {
    return NextResponse.json(
      { error: "company_id e alvara_id são obrigatórios" },
      { status: 400 }
    );
  }

  let data_vencimento = body.data_vencimento ?? null;
  if (body.data_emissao && data_vencimento == null) {
    const { data: av, error: avErr } = await supabase
      .from("alvaras")
      .select("frequencia, weekend_adjust, legal_dia, legal_mes, legal_dia_semana, legal_dias_uteis")
      .eq("id", body.alvara_id)
      .single();
    if (!avErr && av && isAlvaraFrequencia(av.frequencia) && isWeekendAdjust(av.weekend_adjust)) {
      try {
        data_vencimento = computeDataVencimentoISO(body.data_emissao, av.frequencia, av.weekend_adjust, {
          legal_dia: av.legal_dia ?? null,
          legal_mes: av.legal_mes ?? null,
          legal_dia_semana: av.legal_dia_semana ?? null,
          legal_dias_uteis: av.legal_dias_uteis ?? null,
        });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Data de emissão inválida" },
          { status: 400 }
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("company_alvaras")
    .insert({
      company_id: body.company_id,
      alvara_id: body.alvara_id,
      numero: body.numero ?? null,
      data_emissao: body.data_emissao ?? null,
      data_vencimento,
      data_notificacao: body.data_notificacao ?? null,
      status: body.status ?? "pendente",
      observacoes: body.observacoes ?? null,
      arquivo_url: body.arquivo_url ?? null,
    })
    .select(
      `
      *,
      alvaras ( *, alvara_groups ( * ) )
    `
    )
    .single();

  if (error) {
    if (error.message.includes("duplicate") || error.code === "23505") {
      return NextResponse.json(
        { error: "Esta empresa já possui vínculo com este alvará" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ company_alvara: data });
}

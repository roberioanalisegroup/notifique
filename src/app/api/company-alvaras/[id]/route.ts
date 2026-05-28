import { getSupabaseForRequest } from "@/lib/api-auth";
import { logCompanyHistory } from "@/lib/company-history";
import {
  computeDataVencimentoISO,
  isAlvaraFrequencia,
  isWeekendAdjust,
  type AlvaraFrequencia,
} from "@/lib/alvara-frequency";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { data: beforeRow } = await supabase
    .from("company_alvaras")
    .select(
      `
      company_id,
      alvaras ( name )
    `
    )
    .eq("id", id)
    .single();
  const patch: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };

  const vencimentoExplicito = Object.prototype.hasOwnProperty.call(body, "data_vencimento");
  const isFreqChanged = Object.prototype.hasOwnProperty.call(body, "frequencia_override") || 
                        Object.prototype.hasOwnProperty.call(body, "dias_frequencia_personalizada");
  
  let shouldRecalculate = false;
  let activeEmissao = "";

  if (body.data_emissao && typeof body.data_emissao === "string") {
    shouldRecalculate = !vencimentoExplicito;
    activeEmissao = body.data_emissao;
  } else if (isFreqChanged && !vencimentoExplicito) {
    const { data: currentLink } = await supabase
      .from("company_alvaras")
      .select("data_emissao")
      .eq("id", id)
      .single();
    if (currentLink?.data_emissao) {
      shouldRecalculate = true;
      activeEmissao = currentLink.data_emissao;
    }
  }

  if (shouldRecalculate) {
    const { data: row, error: rowErr } = await supabase
      .from("company_alvaras")
      .select("alvara_id, frequencia_override, dias_frequencia_personalizada")
      .eq("id", id)
      .single();
    if (!rowErr && row?.alvara_id) {
      const { data: av } = await supabase
        .from("alvaras")
        .select("frequencia, weekend_adjust, legal_dia, legal_mes, legal_dia_semana, legal_dias_uteis, dias_frequencia_personalizada")
        .eq("id", row.alvara_id)
        .single();
      if (av && isWeekendAdjust(av.weekend_adjust)) {
        const freq = (Object.prototype.hasOwnProperty.call(body, "frequencia_override") 
          ? body.frequencia_override 
          : (row.frequencia_override || av.frequencia)) as AlvaraFrequencia;
        
        const dias = freq === "personalizada" 
          ? (Object.prototype.hasOwnProperty.call(body, "dias_frequencia_personalizada") 
              ? (body.dias_frequencia_personalizada as number | null)
              : (row.frequencia_override ? row.dias_frequencia_personalizada : av.dias_frequencia_personalizada))
          : null;

        if (isAlvaraFrequencia(freq)) {
          try {
            patch.data_vencimento = computeDataVencimentoISO(
              activeEmissao,
              freq,
              av.weekend_adjust,
              {
                legal_dia: av.legal_dia ?? null,
                legal_mes: av.legal_mes ?? null,
                legal_dia_semana: av.legal_dia_semana ?? null,
                legal_dias_uteis: av.legal_dias_uteis ?? null,
              },
              dias
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
  }

  const { data, error } = await supabase
    .from("company_alvaras")
    .update(patch)
    .eq("id", id)
    .select(
      `
      *,
      alvaras ( *, alvara_groups!group_id ( * ) )
    `
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updated = data as {
    data_emissao: string | null;
    data_vencimento: string | null;
    id: string;
  };

  const hasEm =
    updated.data_emissao &&
    typeof updated.data_emissao === "string" &&
    updated.data_emissao.length >= 10;

  if (!hasEm) {
    const { error: tUpErr } = await supabase
      .from("alvara_tasks")
      .update({ due_date: null, updated_at: new Date().toISOString() })
      .eq("company_alvara_id", id)
      .eq("status", "pendente");
    if (tUpErr) {
      if (tUpErr.code === "23505" || (tUpErr.message?.toLowerCase().includes("duplicate") ?? false)) {
        return NextResponse.json(
          { error: "Já existe outra tarefa pendente para este vínculo sem data de vencimento definida." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: tUpErr.message }, { status: 500 });
    }
  } else if (updated.data_vencimento && typeof updated.data_vencimento === "string") {
    const due = String(updated.data_vencimento).slice(0, 10);
    const { error: tUpErr } = await supabase
      .from("alvara_tasks")
      .update({ due_date: due, updated_at: new Date().toISOString() })
      .eq("company_alvara_id", id)
      .eq("status", "pendente");
    if (tUpErr) {
      if (tUpErr.code === "23505" || (tUpErr.message?.toLowerCase().includes("duplicate") ?? false)) {
        return NextResponse.json(
          { error: "Conflito de datas: já existe outra tarefa pendente para este vínculo com a data de vencimento informada." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: tUpErr.message }, { status: 500 });
    }
  }

  const companyId = (beforeRow as { company_id?: string } | null)?.company_id;
  const alvaraNome =
    (beforeRow as { alvaras?: { name?: string | null } } | null)?.alvaras?.name?.trim() ||
    "Tarefa";
  const touched = Object.keys(body).filter(
    (k) => !["updated_at"].includes(k) && Object.prototype.hasOwnProperty.call(body, k)
  );
  if (companyId) {
    const actorUserId = auth.isServiceRole ? null : auth.userId;
    await logCompanyHistory(supabase, {
      companyId,
      eventType: "tarefa_atualizada",
      summary:
        touched.length > 0
          ? `Vínculo atualizado (${alvaraNome}): ${touched.join(", ")}.`
          : `Vínculo atualizado (${alvaraNome}).`,
      metadata: {
        company_alvara_id: id,
        campos: touched,
      },
      actorUserId,
    });
  }

  return NextResponse.json({ company_alvara: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: row, error: selErr } = await supabase
    .from("company_alvaras")
    .select(
      `
      company_id,
      alvaras ( name )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  const { error } = await supabase.from("company_alvaras").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (row) {
    const companyId = (row as { company_id: string }).company_id;
    const alvaraNome =
      (row as { alvaras?: { name?: string | null } }).alvaras?.name?.trim() || "Tarefa";
    const actorUserId = auth.isServiceRole ? null : auth.userId;
    await logCompanyHistory(supabase, {
      companyId,
      eventType: "tarefa_desvinculada",
      summary: `Tarefa desvinculada: ${alvaraNome}.`,
      metadata: {
        company_alvara_id: id,
        alvara_name: alvaraNome,
      },
      actorUserId,
    });
  }

  return NextResponse.json({ ok: true });
}

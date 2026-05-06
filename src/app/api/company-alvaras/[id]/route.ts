import { getSupabaseForRequest } from "@/lib/api-auth";
import { logCompanyHistory } from "@/lib/company-history";
import {
  computeDataVencimentoISO,
  isAlvaraFrequencia,
  isWeekendAdjust,
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
  if (body.data_emissao && typeof body.data_emissao === "string" && !vencimentoExplicito) {
    const { data: row, error: rowErr } = await supabase
      .from("company_alvaras")
      .select("alvara_id")
      .eq("id", id)
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
    .eq("id", id)
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
    await supabase
      .from("alvara_tasks")
      .update({ due_date: null, updated_at: new Date().toISOString() })
      .eq("company_alvara_id", id)
      .eq("status", "pendente");
  } else if (updated.data_vencimento && typeof updated.data_vencimento === "string") {
    const due = String(updated.data_vencimento).slice(0, 10);
    await supabase
      .from("alvara_tasks")
      .update({ due_date: due, updated_at: new Date().toISOString() })
      .eq("company_alvara_id", id)
      .eq("status", "pendente");
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

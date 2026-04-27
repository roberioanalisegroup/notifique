import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  computeDataVencimentoISO,
  isAlvaraFrequencia,
  isWeekendAdjust,
} from "@/lib/alvara-frequency";
import type { Alvara, AlvaraTask } from "@/types";
import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

type Body = {
  status?: "pendente" | "concluida" | "cancelada";
  notes?: string | null;
  registrarBaixaNoVinculo?: boolean;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const p = await Promise.resolve(params);
  const id = p.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (
    body.status != null &&
    !["pendente", "concluida", "cancelada"].includes(body.status)
  ) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  const { data: task, error: tErr } = await supabase
    .from("alvara_tasks")
    .select("id, company_alvara_id, status")
    .eq("id", id)
    .single();

  if (tErr || !task) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  if (body.registrarBaixaNoVinculo) {
    const { data: ca, error: cErr } = await supabase
      .from("company_alvaras")
      .select("id, alvara_id")
      .eq("id", task.company_alvara_id)
      .single();

    if (cErr || !ca) {
      return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
    }

    const { data: alvara, error: aErr } = await supabase
      .from("alvaras")
      .select("*")
      .eq("id", ca.alvara_id)
      .single();

    if (aErr || !alvara) {
      return NextResponse.json({ error: "Tipo de alvará não encontrado" }, { status: 404 });
    }

    const a = alvara as Alvara;
    if (!isAlvaraFrequencia(a.frequencia) || !isWeekendAdjust(a.weekend_adjust)) {
      return NextResponse.json(
        { error: "Frequência / ajuste de fim de semana inválidos no tipo" },
        { status: 400 }
      );
    }

    const hoje = format(new Date(), "yyyy-MM-dd");
    let dataVencimento: string;
    try {
      dataVencimento = computeDataVencimentoISO(hoje, a.frequencia, a.weekend_adjust, {
        legal_dia: a.legal_dia,
        legal_mes: a.legal_mes,
        legal_dia_semana: a.legal_dia_semana,
        legal_dias_uteis: a.legal_dias_uteis,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Não foi possível calcular o próximo vencimento" },
        { status: 400 }
      );
    }

    const { error: uErr } = await supabase
      .from("company_alvaras")
      .update({
        data_emissao: hoje,
        data_vencimento: dataVencimento,
        status: "emitido",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ca.id);

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }
  }

  const newStatus: AlvaraTask["status"] | undefined =
    body.status ?? (body.registrarBaixaNoVinculo ? "concluida" : undefined);

  if (newStatus == null && !Object.prototype.hasOwnProperty.call(body, "notes")) {
    return NextResponse.json(
      { error: "Informe status, notas ou registrarBaixaNoVinculo" },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (newStatus != null) {
    patch.status = newStatus;
    if (newStatus === "concluida" || newStatus === "cancelada") {
      patch.completed_at = new Date().toISOString();
    }
    if (newStatus === "pendente") {
      patch.completed_at = null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    patch.notes = body.notes;
  }

  const { data: updated, error: u2 } = await supabase
    .from("alvara_tasks")
    .update(patch)
    .eq("id", id)
    .select(
      `
      *,
      company_alvaras (
        *,
        companies ( id, cnpj, razao_social, nome_fantasia ),
        alvaras ( *, alvara_groups ( id, name, color ) )
      )
    `
    )
    .single();

  if (u2) {
    return NextResponse.json({ error: u2.message }, { status: 500 });
  }
  return NextResponse.json({ task: updated as AlvaraTask & Record<string, unknown> });
}

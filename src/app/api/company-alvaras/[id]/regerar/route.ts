import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  computeDataVencimentoISO,
  isAlvaraFrequencia,
  isWeekendAdjust,
  type AlvaraFrequencia,
} from "@/lib/alvara-frequency";
import { format, parseISO } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // 1. Fetch the company alvara link
  const { data: ca, error: caErr } = await supabase
    .from("company_alvaras")
    .select(`
      *,
      alvaras ( * )
    `)
    .eq("id", id)
    .single();

  if (caErr || !ca) {
    return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
  }

  // 2. Fetch the pending task for this vínculo
  const { data: task, error: tErr } = await supabase
    .from("alvara_tasks")
    .select("*")
    .eq("company_alvara_id", id)
    .eq("status", "pendente")
    .maybeSingle();

  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  if (!task) {
    return NextResponse.json({ error: "Nenhuma tarefa pendente ativa encontrada para este vínculo." }, { status: 400 });
  }

  const alv = ca.alvaras;
  const activeFreq = ca.frequencia_override || alv.frequencia;
  const activeDias = ca.frequencia_override
    ? ca.dias_frequencia_personalizada
    : alv.dias_frequencia_personalizada;

  let updatedVencimento: string | null = null;
  let updatedInicioOb: string | null = null;
  let logSummary = "";

  const hasEmissao = ca.data_emissao && String(ca.data_emissao).trim() !== "";

  if (hasEmissao) {
    // Has emission date -> calculate legal/custom due date
    if (!isAlvaraFrequencia(activeFreq) || !isWeekendAdjust(alv.weekend_adjust)) {
      return NextResponse.json({ error: "Frequência ou regra de fim de semana inválida no tipo/vínculo" }, { status: 400 });
    }

    try {
      updatedVencimento = computeDataVencimentoISO(
        ca.data_emissao,
        activeFreq as AlvaraFrequencia,
        alv.weekend_adjust,
        {
          legal_dia: alv.legal_dia,
          legal_mes: alv.legal_mes,
          legal_dia_semana: alv.legal_dia_semana,
          legal_dias_uteis: alv.legal_dias_uteis,
        },
        activeDias
      );
      updatedInicioOb = null; // Clean up since it has emissao
      logSummary = `Datas regeradas com base na periodicidade ativa (${
        activeFreq === "personalizada" ? `${activeDias} dias` : activeFreq
      }): vencimento definido para ${format(new Date(updatedVencimento + "T00:00:00"), "dd/MM/yyyy")}.`;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao calcular vencimento" }, { status: 400 });
    }
  } else {
    // "Não definida" state -> recalculate limit (inicio_obrigatorio_ate) from task creation date
    const prazoDias = Math.min(3650, Math.max(1, Number(alv.prazo_inicio_dias ?? 30) || 30));
    const baseDia = format(parseISO(String(task.created_at)), "yyyy-MM-dd");
    
    // Add days to creation date
    const dt = parseISO(baseDia);
    dt.setDate(dt.getDate() + prazoDias);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    
    updatedInicioOb = `${y}-${m}-${d}`;
    updatedVencimento = null; // Do not fill expiration date in the vínculo until manually set
    logSummary = `Datas regeradas (vínculo sem emissão): limite de definição configurado até ${format(new Date(updatedInicioOb + "T00:00:00"), "dd/MM/yyyy")}.`;
  }

  // 3. Update company_alvaras
  const { error: caUpErr } = await supabase
    .from("company_alvaras")
    .update({
      data_vencimento: updatedVencimento,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (caUpErr) {
    return NextResponse.json({ error: caUpErr.message }, { status: 500 });
  }

  // 4. Update alvara_tasks (pending task)
  const { error: tUpErr } = await supabase
    .from("alvara_tasks")
    .update({
      due_date: hasEmissao ? updatedVencimento : null,
      inicio_obrigatorio_ate: updatedInicioOb,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.id);

  if (tUpErr) {
    if (tUpErr.code === "23505" || (tUpErr.message?.toLowerCase().includes("duplicate") ?? false)) {
      return NextResponse.json(
        { error: "Conflito de datas: já existe outra tarefa pendente para este vínculo com o mesmo vencimento." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: tUpErr.message }, { status: 500 });
  }

  // 5. Insert history event
  await supabase.from("alvara_task_history").insert({
    task_id: task.id,
    event_type: "system",
    summary: logSummary,
    metadata: {
      data_emissao: ca.data_emissao,
      data_vencimento: updatedVencimento,
      inicio_obrigatorio_ate: updatedInicioOb,
      frequencia: activeFreq,
      dias: activeDias,
    },
  });

  return NextResponse.json({
    ok: true,
    task_id: task.id,
    data_vencimento: updatedVencimento,
    inicio_obrigatorio_ate: updatedInicioOb,
    summary: logSummary,
  });
}

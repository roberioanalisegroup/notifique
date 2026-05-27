import { COMPANY_IN_TASK_SELECT } from "@/lib/alvara-task-company-select";
import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  computeDataVencimentoISO,
  isAlvaraFrequencia,
  isWeekendAdjust,
  type AlvaraFrequencia,
} from "@/lib/alvara-frequency";
import { proximoVencimentoISOFromEmissao } from "@/lib/alvara-task-generation";
import { sanitizeText } from "@/lib/utils";
import type { Alvara, AlvaraTask } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

const TASK_SELECT = `
  *,
  company_alvaras (
    *,
    companies ( ${COMPANY_IN_TASK_SELECT} ),
    alvaras ( *, alvara_groups!group_id ( id, name, color ) )
  )
`;

type Body = {
  status?: "pendente" | "concluida" | "cancelada";
  notes?: string | null;
  registrarBaixaNoVinculo?: boolean;
  arquivo_url?: string | null;
  protocolo?: string | null;
};

function isPgUniqueViolation(err: { code?: string; message?: string } | null) {
  return err?.code === "23505" || (err?.message?.toLowerCase().includes("duplicate") ?? false);
}

async function insertHistory(
  supabase: SupabaseClient,
  taskId: string,
  event_type: "created" | "status" | "notes" | "attachment" | "due_date" | "system" | "checklist",
  summary: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("alvara_task_history").insert({
    task_id: taskId,
    event_type,
    summary,
    metadata,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(_request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const p = await Promise.resolve(params);
  const id = p.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const { data: task, error: tErr } = await supabase
    .from("alvara_tasks")
    .select(TASK_SELECT)
    .eq("id", id)
    .single();

  if (tErr || !task) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  const { data: history, error: hErr } = await supabase
    .from("alvara_task_history")
    .select("*")
    .eq("task_id", id)
    .order("created_at", { ascending: false });

  if (hErr) {
    return NextResponse.json({ error: hErr.message }, { status: 500 });
  }

  return NextResponse.json({ task, history: history ?? [] });
}

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

  const { data: taskRow, error: tErr } = await supabase
    .from("alvara_tasks")
    .select("id, company_alvara_id, status, notes, due_date, protocolo")
    .eq("id", id)
    .single();

  if (tErr || !taskRow) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  const { data: ca0, error: caErr } = await supabase
    .from("company_alvaras")
    .select("id, data_emissao, arquivo_url")
    .eq("id", taskRow.company_alvara_id)
    .single();

  if (caErr || !ca0) {
    return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
  }

  let ca = ca0 as { id: string; data_emissao: string | null; arquivo_url: string | null };

  const hasArquivo = Object.prototype.hasOwnProperty.call(body, "arquivo_url");
  if (hasArquivo) {
    const nextUrl = body.arquivo_url ?? null;
    if (nextUrl !== ca.arquivo_url) {
      const { error: uArq } = await supabase
        .from("company_alvaras")
        .update({
          arquivo_url: nextUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ca.id);
      if (uArq) {
        return NextResponse.json({ error: uArq.message }, { status: 500 });
      }
      await insertHistory(supabase, id, "attachment", "Anexo do vínculo atualizado", {
        anterior: ca.arquivo_url,
        novo: nextUrl,
      });
      ca = { ...ca, arquivo_url: nextUrl };
    }
  }

  /*
  if (body.registrarBaixaNoVinculo) {
    const { data: caFull, error: cErr } = await supabase
      .from("company_alvaras")
      .select("id, alvara_id")
      .eq("id", taskRow.company_alvara_id)
      .single();

    if (cErr || !caFull) {
      return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
    }

    const { data: alvara, error: aErr } = await supabase
      .from("alvaras")
      .select("*")
      .eq("id", caFull.alvara_id)
      .single();

    if (aErr || !alvara) {
      return NextResponse.json({ error: "Tipo de alvará não encontrado" }, { status: 404 });
    }

    const a = alvara as Alvara;
    if (a.frequencia === "personalizada") {
      return NextResponse.json(
        { error: "Frequência personalizada exige preenchimento manual das datas de emissão e vencimento no card." },
        { status: 400 }
      );
    }
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
      .eq("id", caFull.id);

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    const { error: uDue } = await supabase
      .from("alvara_tasks")
      .update({
        due_date: dataVencimento,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (uDue) {
      return NextResponse.json({ error: uDue.message }, { status: 500 });
    }

    ca = { ...ca, data_emissao: hoje };

    await insertHistory(supabase, id, "system", "Baixa registada no vínculo", {
      data_emissao: hoje,
      data_vencimento: dataVencimento,
    });
  }
  */

  const newStatus: AlvaraTask["status"] | undefined = body.status;

  const hasNotes = Object.prototype.hasOwnProperty.call(body, "notes");

  if (
    newStatus == null &&
    !hasNotes &&
    !body.registrarBaixaNoVinculo &&
    !hasArquivo
  ) {
    return NextResponse.json(
      { error: "Informe status, notas, anexo ou registrarBaixaNoVinculo" },
      { status: 400 }
    );
  }

  if (newStatus === "concluida") {
    const { data: caCheck, error: caCheckErr } = await supabase
      .from("company_alvaras")
      .select("data_emissao, data_vencimento, arquivo_url, alvara_id")
      .eq("id", taskRow.company_alvara_id)
      .single();

    if (caCheckErr) {
      return NextResponse.json({ error: caCheckErr.message }, { status: 500 });
    }

    const activeNotes = body.notes !== undefined ? body.notes : taskRow.notes;
    if (activeNotes == null || String(activeNotes).trim() === "") {
      return NextResponse.json(
        { error: "A descrição / comentário é obrigatória para concluir a tarefa." },
        { status: 400 }
      );
    }

    const em = caCheck?.data_emissao;
    if (em == null || String(em).trim() === "") {
      return NextResponse.json(
        { error: "A data de emissão no vínculo é obrigatória para concluir a tarefa." },
        { status: 400 }
      );
    }

    const venc = caCheck?.data_vencimento;
    if (venc == null || String(venc).trim() === "") {
      return NextResponse.json(
        { error: "A data de vencimento no vínculo é obrigatória para concluir a tarefa." },
        { status: 400 }
      );
    }

    let exigeAnexo = false;
    const aid = caCheck?.alvara_id;
    if (aid) {
      const r = await supabase.from("alvaras").select("anexo_obrigatorio").eq("id", aid).maybeSingle();
      if (!r.error && r.data && (r.data as { anexo_obrigatorio?: boolean }).anexo_obrigatorio === true) {
        exigeAnexo = true;
      }
    }

    const arq = caCheck?.arquivo_url;
    if (exigeAnexo && (arq == null || String(arq).trim() === "")) {
      return NextResponse.json(
        {
          error:
            "Este tipo de alvará exige um documento anexado ao vínculo. Associe o ficheiro antes de concluir a tarefa.",
        },
        { status: 400 }
      );
    }

    const { data: dueRow } = await supabase
      .from("alvara_tasks")
      .select("due_date")
      .eq("id", id)
      .single();
    const due = dueRow?.due_date;
    if (due == null || String(due).trim() === "") {
      return NextResponse.json(
        {
          error:
            "O vencimento da tarefa é obrigatório para concluir. Edite o vínculo e salve antes de concluir.",
        },
        { status: 400 }
      );
    }
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
  if (hasNotes) {
    patch.notes = sanitizeText(body.notes);
  }

  const hasProtocolo = Object.prototype.hasOwnProperty.call(body, "protocolo");
  if (hasProtocolo) {
    patch.protocolo = sanitizeText(body.protocolo);
  }

  const needsTaskUpdate = newStatus != null || hasNotes || hasProtocolo;

  if (needsTaskUpdate) {
    const { error: u2 } = await supabase.from("alvara_tasks").update(patch).eq("id", id);
    if (u2) {
      return NextResponse.json({ error: u2.message }, { status: 500 });
    }
    if (newStatus != null && newStatus !== taskRow.status) {
      await insertHistory(supabase, id, "status", `Estado: ${taskRow.status} → ${newStatus}`, {
        de: taskRow.status,
        para: newStatus,
      });
    }
    if (hasNotes && body.notes !== taskRow.notes) {
      await insertHistory(supabase, id, "notes", "Descrição / comentário atualizado", {
        anterior: taskRow.notes,
        novo: body.notes,
      });
    }
    if (hasProtocolo && body.protocolo !== taskRow.protocolo) {
      await insertHistory(supabase, id, "system", "Número de protocolo atualizado", {
        anterior: taskRow.protocolo,
        novo: body.protocolo,
      });
    }
  }

  if (newStatus === "concluida") {
    const { data: caLink } = await supabase
      .from("company_alvaras")
      .select("data_emissao, data_vencimento, alvara_id, frequencia_override, dias_frequencia_personalizada")
      .eq("id", taskRow.company_alvara_id)
      .single();

    if (caLink?.alvara_id && caLink?.data_emissao) {
      const { data: alvFull } = await supabase.from("alvaras").select("*").eq("id", caLink.alvara_id).single();
      const alv = alvFull as Alvara | null;

      if (alv?.is_active) {
        let nextDue: string | null = null;
        let inicioOb: string | null = null;

        const activeFreq = caLink.frequencia_override || alv.frequencia;
        const activeDias = caLink.frequencia_override
          ? caLink.dias_frequencia_personalizada
          : alv.dias_frequencia_personalizada;

        let nextVencimento: string | null = null;
        if (activeFreq === "personalizada") {
          const prazoDias = Math.min(3650, Math.max(1, Number(alv.prazo_inicio_dias ?? 30) || 30));
          const dt = new Date();
          dt.setDate(dt.getDate() + prazoDias);
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, "0");
          const d = String(dt.getDate()).padStart(2, "0");
          inicioOb = `${y}-${m}-${d}`;

          // Reset the link dates and status for the next cycle
          await supabase
            .from("company_alvaras")
            .update({
              data_emissao: null,
              data_vencimento: null, // Keep expiration empty initially for next cycle
              status: "pendente",
              updated_at: new Date().toISOString(),
            })
            .eq("id", taskRow.company_alvara_id);
        } else {
          // 1. Calculate nextVencimento = data_vencimento_anterior + frequency
          const baseVenc = caLink.data_vencimento || caLink.data_emissao;
          if (baseVenc) {
            try {
              nextVencimento = computeDataVencimentoISO(
                String(baseVenc).slice(0, 10),
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
            } catch {
              nextVencimento = null;
            }
          }

          // 2. Calculate nextDue (task renewal deadline) = exactly data_vencimento_anterior
          if (caLink.data_vencimento) {
            nextDue = String(caLink.data_vencimento).slice(0, 10);
          } else {
            return NextResponse.json(
              { error: "A data de vencimento do vínculo anterior é obrigatória." },
              { status: 400 }
            );
          }

          // 3. Update the link to reset emission and set next validity for the next cycle
          await supabase
            .from("company_alvaras")
            .update({
              data_emissao: null,
              data_vencimento: null,
              status: "pendente",
              updated_at: new Date().toISOString(),
            })
            .eq("id", taskRow.company_alvara_id);
        }

        const { error: insE } = await supabase.from("alvara_tasks").insert({
          company_alvara_id: taskRow.company_alvara_id,
          due_date: nextDue,
          inicio_obrigatorio_ate: inicioOb,
          status: "pendente",
          title: null,
        });

        if (!insE) {
          await insertHistory(
            supabase,
            id,
            "system",
            nextDue
              ? `Próxima tarefa criada com vencimento ${nextDue} (a partir da emissão do ciclo).`
              : `Próxima tarefa criada (frequência personalizada - prazo de definição até ${inicioOb ? format(new Date(inicioOb + "T00:00:00"), "dd/MM/yyyy") : "—"}).`,
            { proxima_data: nextDue, inicio_obrigatorio_ate: inicioOb }
          );
        } else if (!isPgUniqueViolation(insE)) {
          console.warn("[alvara-tasks] próxima instância:", insE.message);
        }
      }
    }
  }

  const { data: updated, error: u3 } = await supabase
    .from("alvara_tasks")
    .select(TASK_SELECT)
    .eq("id", id)
    .single();

  if (u3 || !updated) {
    return NextResponse.json({ error: u3?.message ?? "Erro" }, { status: 500 });
  }

  const { data: history } = await supabase
    .from("alvara_task_history")
    .select("*")
    .eq("task_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    task: updated as AlvaraTask & Record<string, unknown>,
    history: history ?? [],
  });
}

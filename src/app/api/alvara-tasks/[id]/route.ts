import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  computeDataVencimentoISO,
  isAlvaraFrequencia,
  isWeekendAdjust,
} from "@/lib/alvara-frequency";
import { proximoVencimentoISOFromEmissao } from "@/lib/alvara-task-generation";
import type { Alvara, AlvaraTask } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

const TASK_SELECT = `
  *,
  company_alvaras (
    *,
    companies ( id, cnpj, razao_social, nome_fantasia ),
    alvaras ( *, alvara_groups ( id, name, color ) )
  )
`;

type Body = {
  status?: "pendente" | "concluida" | "cancelada";
  notes?: string | null;
  registrarBaixaNoVinculo?: boolean;
  arquivo_url?: string | null;
};

function isPgUniqueViolation(err: { code?: string; message?: string } | null) {
  return err?.code === "23505" || (err?.message?.toLowerCase().includes("duplicate") ?? false);
}

async function insertHistory(
  supabase: SupabaseClient,
  taskId: string,
  event_type: "created" | "status" | "notes" | "attachment" | "due_date" | "system",
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
    .select("id, company_alvara_id, status, notes")
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

    ca = { ...ca, data_emissao: hoje };

    await insertHistory(supabase, id, "system", "Baixa registada no vínculo", {
      data_emissao: hoje,
      data_vencimento: dataVencimento,
    });
  }

  const newStatus: AlvaraTask["status"] | undefined =
    body.status ?? (body.registrarBaixaNoVinculo ? "concluida" : undefined);

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
    const { data: caCheck } = await supabase
      .from("company_alvaras")
      .select("data_emissao")
      .eq("id", taskRow.company_alvara_id)
      .single();
    const em = caCheck?.data_emissao;
    if (em == null || String(em).trim() === "") {
      return NextResponse.json(
        {
          error:
            "Não é possível concluir sem data de emissão no vínculo. Registe a emissão na empresa ou use «Dar baixa no vínculo».",
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
    patch.notes = body.notes;
  }

  const needsTaskUpdate = newStatus != null || hasNotes;

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
  }

  if (newStatus === "concluida") {
    const { data: caF } = await supabase
      .from("company_alvaras")
      .select("id, data_emissao, alvara_id")
      .eq("id", taskRow.company_alvara_id)
      .single();
    const em = caF?.data_emissao ? String(caF.data_emissao).slice(0, 10) : null;
    if (em && caF?.alvara_id) {
      const { data: alv } = await supabase.from("alvaras").select("*").eq("id", caF.alvara_id).single();
      const a = alv as Alvara | null;
      if (a?.is_active) {
        const nextDue = proximoVencimentoISOFromEmissao(em, a);
        if (nextDue) {
          const { error: insE } = await supabase.from("alvara_tasks").insert({
            company_alvara_id: taskRow.company_alvara_id,
            due_date: nextDue,
            status: "pendente",
            title: null,
          });
          if (!insE) {
            await insertHistory(supabase, id, "system", `Próxima tarefa gerada para ${nextDue}`, {
              proxima_data: nextDue,
            });
          } else if (!isPgUniqueViolation(insE)) {
            console.warn("[alvara-tasks] próxima instância:", insE.message);
          }
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

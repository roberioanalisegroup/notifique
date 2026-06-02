import { COMPANY_IN_TASK_SELECT } from "@/lib/alvara-task-company-select";
import { getSupabaseForRequest } from "@/lib/api-auth";
import { sanitizeText } from "@/lib/utils";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { AlvaraTask } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { validateChecklistObrigatoriaForTask } from "@/lib/alvara-checklist-completion";
import { validarCombinacaoStatus } from "@/lib/validations/alvara-status";

const TASK_SELECT = `
  *,
  company_alvaras (
    *,
    companies ( ${COMPANY_IN_TASK_SELECT} ),
    alvaras ( *, alvara_groups!group_id ( id, name, color ) ),
    company_alvara_documents ( * )
  )
`;

type Body = {
  status?: "pendente" | "em_andamento" | "com_impedimento" | "concluida" | "cancelada";
  notes?: string | null;
  protocolo?: string | null;
  cancellation_reason?: string | null;
  impediment_reason?: string | null;
  
  // Document parameters passed specifically on completion
  issue_date?: string | null;
  expiration_date?: string | null;
  is_indefinite?: boolean;
  file_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  file_mime_type?: string | null;

  // Evidence attachments
  evidence_attachments?: Array<{
    storage_key: string;
    public_url: string;
    file_name: string;
    file_size: number;
    file_mime_type: string;
  }> | null;
};

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

  const newStatus = body.status;
  if (
    newStatus != null &&
    !["pendente", "em_andamento", "com_impedimento", "concluida", "cancelada"].includes(newStatus)
  ) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  // Fetch the current task row
  const { data: taskRow, error: tErr } = await supabase
    .from("alvara_tasks")
    .select("id, company_alvara_id, status, notes, due_date, protocolo, result_document_id")
    .eq("id", id)
    .single();

  if (tErr || !taskRow) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  // 1. Garantir no backend que tarefas já encerradas (concluídas ou canceladas) não possam ser re-submetidas/concluídas novamente, exceto via Reabertura Administrativa
  if (taskRow.status === "concluida" || taskRow.status === "cancelada") {
    const isReopening = newStatus != null && ["pendente", "em_andamento", "com_impedimento"].includes(newStatus);
    
    if (isReopening && !auth.isServiceRole) {
      // Reabertura Administrativa Excepcional
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", auth.userId)
        .single();
        
      if (profile?.role !== "admin") {
        return NextResponse.json(
          { error: "A reabertura de tarefas concluídas ou canceladas é restrita a administradores e deve ser tratada como exceção." },
          { status: 403 }
        );
      }
      
      const justificativa = (body as any).justificativa || (body as any).reopening_reason;
      if (!justificativa || String(justificativa).trim().length < 10) {
        return NextResponse.json(
          { error: "Uma justificativa de reabertura administrativa com pelo menos 10 caracteres é obrigatória para reabrir esta tarefa." },
          { status: 400 }
        );
      }
      
      // Armazena a justificativa no PATCH para ser incluída nas notas ou histórico
      (body as any)._administrative_justification = String(justificativa).trim();
    } else if (!auth.isServiceRole) {
      return NextResponse.json(
        { error: "Esta tarefa já foi encerrada (concluída ou cancelada) e não pode sofrer novas alterações." },
        { status: 400 }
      );
    }
  }

  // Fetch the link details
  const { data: linkRow, error: caErr } = await supabase
    .from("company_alvaras")
    .select("id, status, monitoring_status, archived_at")
    .eq("id", taskRow.company_alvara_id)
    .single();

  if (caErr || !linkRow) {
    return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
  }

  // ==========================================
  // CASE A: TASK COMPLETION (RPC CALL)
  // ==========================================
  if (newStatus === "concluida") {
    // 1. Rígidas validações de backend
    const activeNotes = body.notes !== undefined ? body.notes : taskRow.notes;
    if (!activeNotes || String(activeNotes).trim() === "") {
      return NextResponse.json(
        { error: "A descrição / comentário é obrigatória para concluir a tarefa." },
        { status: 400 }
      );
    }

    if (!body.issue_date) {
      return NextResponse.json(
        { error: "A data de emissão é obrigatória para concluir a tarefa." },
        { status: 400 }
      );
    }

    if (!body.is_indefinite && !body.expiration_date) {
      return NextResponse.json(
        { error: "A data de vencimento é obrigatória para validade determinada." },
        { status: 400 }
      );
    }

    if (!body.is_indefinite && body.expiration_date && body.expiration_date < body.issue_date) {
      return NextResponse.json(
        { error: "A data de vencimento não pode ser anterior à data de emissão." },
        { status: 400 }
      );
    }

    const { data: linkAlvara } = await supabase
      .from("company_alvaras")
      .select("alvara_id, alvaras ( checklist_obrigatorio )")
      .eq("id", taskRow.company_alvara_id)
      .maybeSingle();

    const alvaraRow = linkAlvara?.alvaras as { checklist_obrigatorio?: boolean } | null;
    if (alvaraRow?.checklist_obrigatorio === true && linkAlvara?.alvara_id) {
      const checklistErr = await validateChecklistObrigatoriaForTask(
        supabase,
        id,
        linkAlvara.alvara_id
      );
      if (checklistErr) {
        return NextResponse.json({ error: checklistErr }, { status: 400 });
      }
    }

    try {
      // 2. Executar a RPC transacional
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("complete_alvara_task", {
        p_task_id: id,
        p_issue_date: body.issue_date,
        p_expiration_date: body.is_indefinite ? null : body.expiration_date,
        p_is_indefinite: body.is_indefinite ?? false,
        p_file_path: body.file_path ?? null,
        p_file_name: body.file_name ?? null,
        p_file_size: body.file_size ? Number(body.file_size) : null,
        p_file_mime: body.file_mime_type ?? null,
        p_notes: sanitizeText(body.notes),
        p_user_id: auth.userId || null,
      });

      if (rpcErr) {
        throw rpcErr;
      }

      // 3. Atualizar o protocolo se tiver sido fornecido
      if (body.protocolo !== undefined && body.protocolo !== taskRow.protocolo) {
        await supabase
          .from("alvara_tasks")
          .update({ protocolo: sanitizeText(body.protocolo), updated_at: new Date().toISOString() })
          .eq("id", id);
      }

      // Return the updated task row
      const { data: updatedTask } = await supabase
        .from("alvara_tasks")
        .select(TASK_SELECT)
        .eq("id", id)
        .single();

      const { data: updatedHistory } = await supabase
        .from("alvara_task_history")
        .select("*")
        .eq("task_id", id)
        .order("created_at", { ascending: false });

      return NextResponse.json({
        task: updatedTask,
        history: updatedHistory ?? [],
      });

    } catch (lifecycleError: any) {
      console.error("[CRITICAL RPC RENEWAL ERROR]", lifecycleError);

      // Persistência resiliente de erro fora da transação via service_role (RSL Lockdown)
      try {
        const serviceRoleClient = createServiceRoleClient();
        await serviceRoleClient.from("lifecycle_errors").insert({
          company_alvara_id: taskRow.company_alvara_id,
          task_id: id,
          operation: "concluir_tarefa",
          error_message: lifecycleError.message || String(lifecycleError),
          payload: { body, error_details: { message: lifecycleError.message, name: lifecycleError.name } },
        });
      } catch (logErr) {
        console.error("Erro ao registrar erro em lifecycle_errors via service_role:", logErr);
      }

      return NextResponse.json(
        { error: lifecycleError.message || "Erro no processamento do ciclo de renovação automática." },
        { status: 400 }
      );
    }
  }

  // ==========================================
  // CASE B: NORMAL UPDATE (STATUS, NOTES, PROTOCOLO, Impedimento, Cancelamento)
  // ==========================================
  if (newStatus != null && newStatus !== taskRow.status) {
    const validation = validarCombinacaoStatus(newStatus, linkRow.status);
    if (!validation.valido) {
      return NextResponse.json({ error: validation.mensagem }, { status: 400 });
    }
  }

  const patch: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (newStatus != null) {
    patch.status = newStatus;
    if (newStatus === "cancelada") {
      patch.cancelled_at = new Date().toISOString();
      patch.cancelled_by = auth.userId || null;
      patch.cancellation_reason = sanitizeText(body.cancellation_reason) || null;
    } else if (newStatus === "com_impedimento") {
      patch.impediment_reason = sanitizeText(body.impediment_reason) || null;
    } else if (newStatus === "pendente" || newStatus === "em_andamento") {
      patch.completed_at = null;
      patch.cancelled_at = null;
      patch.cancelled_by = null;
      patch.cancellation_reason = null;
      patch.impediment_reason = null;
    }
  }

  if (body.notes !== undefined) {
    patch.notes = sanitizeText(body.notes);
  }

  if (body.protocolo !== undefined) {
    patch.protocolo = sanitizeText(body.protocolo);
  }

  const { error: patchErr } = await supabase
    .from("alvara_tasks")
    .update(patch)
    .eq("id", id);

  if (patchErr) {
    if (patchErr.code === "23505" || patchErr.message?.toLowerCase().includes("duplicate")) {
      return NextResponse.json(
        { error: "Já existe uma tarefa de renovação aberta para este ciclo neste alvará." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: patchErr.message }, { status: 500 });
  }

  // Gravar no histórico correspondente
  if (newStatus != null && newStatus !== taskRow.status) {
    let summary = `Estado: ${taskRow.status} → ${newStatus}`;
    const just = (body as any)._administrative_justification;
    
    if (just) {
      summary += ` [REABERTURA ADMINISTRATIVA]. Justificativa: ${just}`;
    } else if (newStatus === "cancelada" && body.cancellation_reason) {
      summary += ` (Motivo: ${body.cancellation_reason})`;
    } else if (newStatus === "com_impedimento" && body.impediment_reason) {
      summary += ` (Impedimento: ${body.impediment_reason})`;
    }

    await insertHistory(supabase, id, "status", summary, {
      de: taskRow.status,
      para: newStatus,
      motivo: body.cancellation_reason || body.impediment_reason || just || null,
      justificativa: just ?? null,
    });
  }

  const notesChanged = body.notes !== undefined && body.notes !== taskRow.notes;
  const hasEvidence = !!body.evidence_attachments && body.evidence_attachments.length > 0;

  if (hasEvidence && (taskRow.status === "concluida" || taskRow.status === "cancelada")) {
    return NextResponse.json(
      { error: "Não é possível adicionar evidências a uma tarefa já fechada." },
      { status: 400 }
    );
  }

  if (notesChanged || hasEvidence) {
    const isCombined = notesChanged && hasEvidence;
    const isOnlyEvidence = !notesChanged && hasEvidence;

    let eventType: Parameters<typeof insertHistory>[2] = "notes";
    let summary = "";
    if (isCombined) summary = "Comentário e evidência adicionados";
    else if (isOnlyEvidence) {
      summary = "Evidência adicionada";
    } else {
      summary = "Descrição / comentário atualizado";
    }

    const metadata: Record<string, unknown> = {};
    if (notesChanged) {
      metadata.anterior = taskRow.notes;
      metadata.novo = body.notes;
    }
    if (hasEvidence) {
      metadata.evidence_attachments = body.evidence_attachments!.map(att => ({
        ...att,
        uploaded_at: new Date().toISOString(),
        uploaded_by: auth.userId || null,
      }));
    }

    await insertHistory(supabase, id, eventType, summary, metadata);
  }

  if (body.protocolo !== undefined && body.protocolo !== taskRow.protocolo) {
    await insertHistory(supabase, id, "system", "Número de protocolo atualizado", {
      anterior: taskRow.protocolo,
      novo: body.protocolo,
    });
  }

  // Fetch updated task and history to return
  const { data: updated } = await supabase
    .from("alvara_tasks")
    .select(TASK_SELECT)
    .eq("id", id)
    .single();

  const { data: history } = await supabase
    .from("alvara_task_history")
    .select("*")
    .eq("task_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    task: updated,
    history: history ?? [],
  });
}

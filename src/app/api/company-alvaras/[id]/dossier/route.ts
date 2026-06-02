import { getSupabaseForRequest } from "@/lib/api-auth";
import { computeDocumentStatus, computeTaskStatus } from "@/lib/alvara-status";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  // 1. Fetch user role
  const { data: meProf } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = meProf?.role || "user";
  const isAdminOrGestor = role === "admin" || role === "gestor";

  // 2. Fetch company_alvara link details
  const { data: link, error: linkErr } = await supabase
    .from("company_alvaras")
    .select(`
      *,
      alvaras (
        id,
        name,
        description,
        orgao_emissor,
        frequencia,
        weekend_adjust,
        prazo_inicio_dias,
        anexo_obrigatorio,
        group_id
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }
  if (!link) {
    return NextResponse.json({ error: "Vínculo de alvará não encontrado" }, { status: 404 });
  }

  // 3. Fetch alvara group
  let group = null;
  const alvara = link.alvaras;
  if (alvara?.group_id) {
    const { data: groupData } = await supabase
      .from("alvara_groups")
      .select("id, name, color, icon")
      .eq("id", alvara.group_id)
      .maybeSingle();
    group = groupData;
  }

  // 4. Fetch all documents for this link
  const { data: documentsData, error: docsErr } = await supabase
    .from("company_alvara_documents")
    .select("*")
    .eq("company_alvara_id", id)
    .order("issue_date", { ascending: false });

  if (docsErr) {
    return NextResponse.json({ error: docsErr.message }, { status: 500 });
  }

  const documents = documentsData || [];
  const current_document = documents.find((d) => d.is_current) || null;

  // 5. Fetch all tasks for this link
  const { data: tasksData, error: tasksErr } = await supabase
    .from("alvara_tasks")
    .select("*")
    .eq("company_alvara_id", id)
    .order("due_date", { ascending: false });

  if (tasksErr) {
    return NextResponse.json({ error: tasksErr.message }, { status: 500 });
  }

  const tasks = tasksData || [];
  // Find current/active task if any
  const activeTask = tasks.find((t) => t.status === "pendente" || t.status === "em_andamento" || t.status === "com_impedimento");

  // 6. Compute statuses using the pure library
  const hoje = new Date().toISOString().slice(0, 10);
  const document_status = computeDocumentStatus(current_document, hoje);
  const task_status = computeTaskStatus(activeTask, hoje);

  // 7. Fetch histories
  // Document History
  const { data: docHist } = await supabase
    .from("company_alvara_document_history")
    .select("*")
    .eq("company_alvara_id", id);

  // Task History
  let taskHist: any[] = [];
  const taskIds = tasks.map((t) => t.id);
  if (taskIds.length > 0) {
    const { data: tHist } = await supabase
      .from("alvara_task_history")
      .select("*")
      .in("task_id", taskIds);
    taskHist = tHist || [];
  }

  // General Company History (for observations updates)
  const { data: compHist } = await supabase
    .from("company_history")
    .select("*")
    .eq("company_id", link.company_id)
    .eq("event_type", "company_alvara_observations_updated");

  // Lifecycle errors (only if admin/gestor) - Consultas com RLS Lockdown via service_role
  let lifecycleErrors: any[] = [];
  if (isAdminOrGestor) {
    try {
      const serviceRoleClient = createServiceRoleClient();
      const { data: errors, error: fetchErrorsErr } = await serviceRoleClient
        .from("lifecycle_errors")
        .select("*")
        .eq("company_alvara_id", id)
        .order("created_at", { ascending: false });
      
      if (!fetchErrorsErr) {
        lifecycleErrors = errors || [];
      } else {
        console.warn("Falha ao recuperar lifecycle_errors no dossiê (admin/gestor):", fetchErrorsErr.message);
      }
    } catch (clientErr) {
      console.warn("createServiceRoleClient falhou ao buscar lifecycle_errors no dossiê:", clientErr instanceof Error ? clientErr.message : clientErr);
    }
  }

  // 8. Resolve names/profiles for events creators
  const actorIds = new Set<string>();
  (docHist || []).forEach((h) => {
    if (h.created_by) actorIds.add(h.created_by);
  });
  (taskHist || []).forEach((h) => {
    if (h.created_by) actorIds.add(h.created_by);
  });
  (compHist || []).forEach((h) => {
    if (h.actor_user_id) actorIds.add(h.actor_user_id);
  });

  const names: Record<string, { id: string; display_name: string }> = {};
  if (actorIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", Array.from(actorIds));
    for (const p of profs || []) {
      names[p.id] = { id: p.id, display_name: p.display_name || "—" };
    }
  }

  // Helper to map event titles dynamically
  const getDocEventTitle = (evt: string) => {
    switch (evt) {
      case "document_created":
        return "Novo documento cadastrado";
      case "document_replaced":
        return "Documento substituído";
      case "document_file_updated":
        return "Arquivo do documento atualizado";
      case "document_marked_current":
        return "Definido como vigente";
      case "document_archived":
        return "Documento arquivado";
      case "document_restored":
        return "Documento restaurado";
      default:
        return "Ação de documento";
    }
  };

  const getTaskEventTitle = (evt: string) => {
    switch (evt) {
      case "task_created":
        return "Tarefa gerada";
      case "task_status_changed":
        return "Etapa atualizada";
      case "task_completed":
        return "Tarefa concluída";
      case "task_cancelled":
        return "Tarefa cancelada";
      default:
        return "Ação operacional";
    }
  };

  // 9. Format Unified Timeline
  const timeline: any[] = [];

  // Add Document Events
  (docHist || []).forEach((h) => {
    timeline.push({
      id: h.id,
      source: "document",
      event_type: h.event_type,
      title: getDocEventTitle(h.event_type),
      description: h.description,
      created_at: h.created_at,
      created_by: h.created_by ? (names[h.created_by] ?? { id: h.created_by, display_name: "—" }) : null,
      severity: "info",
      metadata: h.metadata || {},
    });
  });

  // Add Task Events
  (taskHist || []).forEach((h) => {
    const taskObj = tasks.find((t) => t.id === h.task_id);
    const taskType = taskObj?.task_type === "renovacao" ? "renovação" : (taskObj?.task_type || "operacional");
    timeline.push({
      id: h.id,
      source: "task",
      event_type: h.event_type,
      title: getTaskEventTitle(h.event_type),
      description: h.description || `Tarefa de ${taskType} alterada.`,
      created_at: h.created_at,
      created_by: h.created_by ? (names[h.created_by] ?? { id: h.created_by, display_name: "—" }) : null,
      severity: h.event_type === "task_cancelled" ? "warning" : "info",
      metadata: {
        ...h.metadata,
        task_id: h.task_id,
        from_status: h.from_status,
        to_status: h.to_status,
      },
    });
  });

  // Add Observations Updates
  (compHist || []).forEach((h) => {
    // Only include if the observation is for this specific alvara link
    if (h.metadata?.company_alvara_id === id) {
      timeline.push({
        id: h.id,
        source: "document",
        event_type: "company_alvara_observations_updated",
        title: "Observações do alvará atualizadas",
        description: h.summary || "As anotações internas foram atualizadas.",
        created_at: h.created_at,
        created_by: h.actor_user_id ? (names[h.actor_user_id] ?? { id: h.actor_user_id, display_name: "—" }) : null,
        severity: "info",
        metadata: h.metadata || {},
      });
    }
  });

  // Add Operational errors (Lifecycle errors - restricted to admin/gestor, fully sanitized)
  if (isAdminOrGestor) {
    lifecycleErrors.forEach((err) => {
      // Mensagem tratada: remove caminhos de arquivos absolutos ou detalhes sensíveis se houver
      const mensagemTratada = err.error_message
        ? err.error_message.replace(/([a-zA-Z]:\\[\w\s\\.-]+|(?:\/[\w\s.-]+)+)/g, "[caminho-sistema]")
        : "Erro operacional desconhecido.";

      timeline.push({
        id: err.id,
        source: "error",
        event_type: "lifecycle_error",
        title: `Erro operacional: ${err.operation || "Geral"}`,
        description: mensagemTratada,
        created_at: err.created_at,
        created_by: null,
        severity: "error",
        metadata: {
          id: err.id,
          operation: err.operation || "Geral",
          mensagem_tratada: mensagemTratada,
          created_at: err.created_at,
          resolved_at: err.resolved_at || null,
          resolved_status: err.resolved_at != null ? "resolvido" : "pendente",
          severity: "error",
          // O payload bruto (err.payload) NÃO é retornado!
        },
      });
    });
  }

  // Sort unified timeline by created_at descending
  timeline.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Clean company_alvaras object for nested response format
  const company_alvara = {
    id: link.id,
    company_id: link.company_id,
    alvara_id: link.alvara_id,
    numero: link.numero,
    observacoes: link.observacoes,
    is_required: link.is_required,
    is_exempt: link.is_exempt,
    exemption_reason: link.exemption_reason,
    monitoring_status: link.monitoring_status,
    archived_at: link.archived_at,
    created_at: link.created_at,
    updated_at: link.updated_at,
  };

  const cleanAlvara = {
    id: alvara?.id,
    name: alvara?.name,
    description: alvara?.description,
    orgao_emissor: alvara?.orgao_emissor,
    frequencia: alvara?.frequencia,
    weekend_adjust: alvara?.weekend_adjust,
    prazo_inicio_dias: alvara?.prazo_inicio_dias,
    anexo_obrigatorio: alvara?.anexo_obrigatorio,
  };

  return NextResponse.json({
    company_alvara,
    alvara: cleanAlvara,
    group,
    current_document,
    documents,
    tasks,
    timeline,
    document_status,
    task_status,
    permissions: {
      canEditObservations: isAdminOrGestor,
      canViewTechnicalLogs: isAdminOrGestor,
      canSuspendMonitoring: isAdminOrGestor,
      canArchiveLink: isAdminOrGestor,
      canArchiveDocuments: isAdminOrGestor,
      canForceCompleteTask: role === "admin",
    },
  });
}

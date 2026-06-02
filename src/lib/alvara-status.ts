/**
 * Biblioteca pura para cálculo e centralização de status de alvarás e tarefas.
 * ISOLAÇÃO ABSOLUTA: Sem dependência de Supabase, React, localStorage ou APIs de navegador.
 */

export type DocumentStatus = "sem_documento" | "indeterminado" | "vigente" | "vencido" | "dispensado";

export interface SimpleDocument {
  is_indefinite?: boolean | null;
  expiration_date?: string | null;
}

export interface SimpleVinculo {
  is_exempt?: boolean | null;
  monitoring_status?: string | null;
}

/**
 * Computa o status de regularidade documental de um alvará vinculado.
 */
export function computeDocumentStatus(
  currentDoc: SimpleDocument | null | undefined,
  hojeStr: string,
  vinculo?: SimpleVinculo | null
): DocumentStatus {
  if (vinculo && (vinculo.monitoring_status === "dispensado" || vinculo.is_exempt === true)) {
    return "dispensado";
  }

  if (!currentDoc) {
    return "sem_documento";
  }

  if (currentDoc.is_indefinite) {
    return "indeterminado";
  }

  if (!currentDoc.expiration_date) {
    return "sem_documento";
  }

  const expDate = currentDoc.expiration_date.slice(0, 10);
  const today = hojeStr.slice(0, 10);

  if (expDate >= today) {
    return "vigente";
  } else {
    return "vencido";
  }
}

export type TaskStatus =
  | "sem_tarefa_aberta"
  | "cancelada"
  | "concluida"
  | "concluida_vencida"
  | "em_andamento"
  | "em_andamento_vencida"
  | "com_impedimento"
  | "com_impedimento_vencida"
  | "pendente"
  | "pendente_vencida";

export interface SimpleTask {
  status: string;
  due_date?: string | null;
  completed_at?: string | null;
  inicio_obrigatorio_ate?: string | null;
  created_at?: string | null;
  start_after?: string | null;
  company_alvaras?: {
    /** @deprecated [LEGADO] data_vencimento na tabela de vínculos é obsoleto e não deve ser usado como fonte oficial. */
    data_vencimento?: string | null;
    /** @deprecated [LEGADO] data_emissao na tabela de vínculos é obsoleto e não deve ser usado como fonte oficial. */
    data_emissao?: string | null;
    alvaras?: {
      prazo_inicio_dias?: number | null;
    } | null;
  } | null;
}

/**
 * Computa o status operacional de uma tarefa relacionada a um alvará vinculado.
 */
export function computeTaskStatus(
  task: SimpleTask | null | undefined,
  hojeStr: string
): TaskStatus {
  if (!task) {
    return "sem_tarefa_aberta";
  }

  const hoje = hojeStr.slice(0, 10);

  if (task.status === "cancelada") {
    return "cancelada";
  }

  // Helper to resolve the limit date of a task
  const limitDate = task.due_date
    ? task.due_date.slice(0, 10)
    : (task.inicio_obrigatorio_ate
        ? task.inicio_obrigatorio_ate.slice(0, 10)
        : (task.company_alvaras?.data_vencimento
            ? task.company_alvaras.data_vencimento.slice(0, 10)
            : null));

  if (task.status === "concluida") {
    const compDate = task.completed_at ? task.completed_at.slice(0, 10) : null;
    if (compDate && limitDate && compDate > limitDate) {
      return "concluida_vencida";
    }
    return "concluida";
  }

  if (task.status === "em_andamento") {
    if (limitDate && limitDate < hoje) {
      return "em_andamento_vencida";
    }
    return "em_andamento";
  }

  if (task.status === "com_impedimento") {
    if (limitDate && limitDate < hoje) {
      return "com_impedimento_vencida";
    }
    return "com_impedimento";
  }

  // pendente status checks
  if (limitDate) {
    if (limitDate < hoje) {
      return "pendente_vencida";
    }
    return "pendente";
  }

  // Check if we can derive from prazo_inicio_dias
  const ca = task.company_alvaras;
  const hasEmissao = ca?.data_emissao != null && String(ca.data_emissao).trim() !== "";
  if (!hasEmissao) {
    const prazoDias = ca?.alvaras?.prazo_inicio_dias ?? 30;
    const baseDia = task.created_at ? task.created_at.slice(0, 10) : hoje;
    const n = Math.min(3650, Math.max(1, Number(prazoDias ?? 30) || 30));
    
    let prazoInicio: string | null = task.inicio_obrigatorio_ate ? task.inicio_obrigatorio_ate.slice(0, 10) : null;
    if (!prazoInicio && baseDia) {
      const dt = new Date(baseDia + "T00:00:00");
      dt.setDate(dt.getDate() + n);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      prazoInicio = `${y}-${m}-${d}`;
    }

    if (prazoInicio && prazoInicio < hoje) {
      return "pendente_vencida";
    }
  }

  return "pendente";
}

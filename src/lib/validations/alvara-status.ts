// src/lib/validations/alvara-status.ts

export type AlvaraStatus = "pendente" | "emitido" | "vencido";
export type TarefaStatus = "pendente" | "em_andamento" | "concluida" | "com_impedimento" | "cancelada";

export type ValidationResult = {
  valido: boolean;
  tipo: "ok" | "atencao" | "invalido";
  mensagem?: string;
};

// Combinações logicamente contraditórias que corrompem o banco e devem ser BLOQUEADAS (Fase 2)
const COMBINACOES_INVALIDAS: Array<[TarefaStatus, AlvaraStatus]> = [
  ["concluida", "vencido"],    // Se a tarefa foi concluída, o alvará não pode ser vencido sem transição
  ["com_impedimento", "emitido"],  // Um alvará já emitido/válido não pode estar sob impedimento operacional
  ["cancelada", "emitido"]     // Um alvará emitido não pode possuir tarefa cancelada no mesmo ciclo
];

// Combinações válidas mas que indicam divergência de sincronização no Kanban (Fase 1 - Alerta)
const COMBINACOES_ATENCAO: Array<[TarefaStatus, AlvaraStatus]> = [
  ["pendente", "emitido"],     // Alvará marcado como emitido, mas tarefa no Kanban não foi iniciada
  ["em_andamento", "emitido"]  // Alvará marcado como emitido, mas tarefa no Kanban ainda consta em andamento
];

/**
 * Valida a combinação de status entre a tarefa (Kanban) e o vínculo principal do alvará.
 * Retorna se o estado resultante é válido, se exige atenção do responsável ou se é inválido.
 */
export function validarCombinacaoStatus(
  tarefaStatus: TarefaStatus,
  alvaraStatus: AlvaraStatus
): ValidationResult {
  // 1. Verificar combinações inválidas (Bloqueantes)
  const isInvalida = COMBINACOES_INVALIDAS.some(
    ([t, a]) => t === tarefaStatus && a === alvaraStatus
  );

  if (isInvalida) {
    return {
      valido: false,
      tipo: "invalido",
      mensagem: `Transação inválida: A tarefa está com status "${tarefaStatus}" mas o alvará principal está cadastrado como "${alvaraStatus}". Operação rejeitada.`
    };
  }

  // 2. Verificar combinações de atenção (Warnings para triagem)
  const isAtencao = COMBINACOES_ATENCAO.some(
    ([t, a]) => t === tarefaStatus && a === alvaraStatus
  );

  if (isAtencao) {
    return {
      valido: true,
      tipo: "atencao",
      mensagem: `Aviso de Sincronização: O alvará consta como "${alvaraStatus}", mas a tarefa no Kanban ainda está "${tarefaStatus}". Certifique-se de atualizar o quadro operacional.`
    };
  }

  // 3. Estado perfeito e logicamente consistente
  return {
    valido: true,
    tipo: "ok"
  };
}

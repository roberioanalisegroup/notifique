import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeDataVencimentoISO,
  isAlvaraFrequencia,
  isWeekendAdjust,
  type AlvaraFrequencia,
} from "@/lib/alvara-frequency";
import type { Alvara } from "@/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import fs from "fs";
import path from "path";

export interface TaskRow {
  id: string;
  company_alvara_id: string;
  status: string;
  notes?: string | null;
  due_date?: string | null;
  protocolo?: string | null;
}

/**
 * Registra erros de transição de ciclo de forma persistente.
 * Tenta escrever na tabela `lifecycle_errors`, com fallback em `audit_logs` e no sistema de arquivos local.
 */
async function persistirErroLifecycle(
  supabase: SupabaseClient,
  companyAlvaraId: string,
  errorMessage: string,
  originalState: Record<string, unknown>,
  failedState: Record<string, unknown> | null = null
) {
  const errorPayload = {
    company_alvara_id: companyAlvaraId,
    error_message: errorMessage,
    original_state: originalState,
    failed_state: failedState,
    created_at: new Date().toISOString(),
  };

  // 1. Log no Console (Standard Out)
  console.error("[CRITICAL LIFECYCLE ERROR]", JSON.stringify(errorPayload, null, 2));

  // 2. Log no Sistema de Arquivos (Bulletproof persistency local)
  try {
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFilePath = path.join(logDir, "lifecycle_errors.log");
    fs.appendFileSync(
      logFilePath,
      `[${new Date().toISOString()}] COMPANY_ALVARA_ID=${companyAlvaraId} | ERROR=${errorMessage} | ORIGINAL=${JSON.stringify(
        originalState
      )} | FAILED=${JSON.stringify(failedState)}\n`,
      "utf8"
    );
  } catch (fsErr) {
    console.error("Falha ao gravar erro de ciclo de vida no arquivo local:", fsErr);
  }

  // 3. Tentar persistência na tabela customizada 'lifecycle_errors' usando service_role
  let dbSuccess = false;
  try {
    const serviceRoleClient = createServiceRoleClient();
    const { error } = await serviceRoleClient.from("lifecycle_errors").insert({
      company_alvara_id: companyAlvaraId,
      operation: "ciclo_renovacao_automatica",
      error_message: errorMessage,
      payload: { original_state: originalState, failed_state: failedState }
    });

    if (error) {
      throw new Error(error.message);
    }
    console.log("Erro de ciclo de vida registrado com sucesso na tabela 'lifecycle_errors' via service_role.");
    dbSuccess = true;
  } catch (dbErr) {
    console.warn(
      `Gravação na tabela 'lifecycle_errors' via service_role falhou/indisponível. Indo direto para o fallback:`,
      dbErr instanceof Error ? dbErr.message : dbErr
    );
  }

  if (dbSuccess) return;

  // 4. Fallback: Logar na tabela padrão 'audit_logs' via service_role (ou supabase se service_role falhar)
  try {
    let clientForAudit = supabase;
    try {
      clientForAudit = createServiceRoleClient();
    } catch {
      // usa o supabase do request caso não consiga instanciar o admin client (ex: em testes locais)
    }

    const { error } = await clientForAudit.from("audit_logs").insert({
      event_type: "lifecycle_transaction_failure",
      metadata: {
        ...errorPayload,
        warning: "Falha crítica de transição de ciclo de renovação de alvará.",
      },
    });

    if (error) {
      throw new Error(error.message);
    }
    console.log("Erro de ciclo de vida registrado com sucesso na tabela de fallback 'audit_logs'.");
  } catch (auditErr) {
    console.error("Falha ao registrar erro no banco no fallback final de audit_logs:", auditErr);
  }
}

/**
 * Processa o ciclo de renovação automática após a conclusão de uma tarefa de alvará.
 * Implementa transação programática em Typescript com rollback manual caso a inserção da próxima tarefa falhe.
 */
export async function processarCicloRenovacao(
  supabase: SupabaseClient,
  taskRow: TaskRow
): Promise<{ success: boolean; nextDueDate?: string | null; message?: string }> {
  const caLinkId = taskRow.company_alvara_id;

  // 1. Obter estado atual do vínculo para backup antes de qualquer mutação
  const { data: caLink, error: fetchErr } = await supabase
    .from("company_alvaras")
    .select("id, status, data_emissao, data_vencimento, alvara_id, frequencia_override, dias_frequencia_personalizada")
    .eq("id", caLinkId)
    .single();

  if (fetchErr || !caLink) {
    throw new Error(`Não foi possível recuperar o vínculo para renovação automática: ${fetchErr?.message || "Não encontrado"}`);
  }

  // Backup do estado original para possível rollback
  const originalState = {
    status: caLink.status,
    data_emissao: caLink.data_emissao,
    data_vencimento: caLink.data_vencimento,
  };

  // 2. Buscar informações do tipo de alvará associado
  const { data: alvFull, error: alvErr } = await supabase
    .from("alvaras")
    .select("*")
    .eq("id", caLink.alvara_id)
    .single();

  if (alvErr || !alvFull) {
    throw new Error(`Não foi possível obter o tipo de alvará associado: ${alvErr?.message || "Não encontrado"}`);
  }

  const alv = alvFull as Alvara;
  if (!alv.is_active) {
    return { success: false, message: "Tipo de alvará inativo. Renovação automática não acionada." };
  }

  // 3. Preparar datas do próximo ciclo
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
  } else {
    // Calcular a data limite da nova tarefa (nextDue) que é exatamente o vencimento do ciclo anterior
    if (caLink.data_vencimento) {
      nextDue = String(caLink.data_vencimento).slice(0, 10);
    } else {
      throw new Error("A data de vencimento do vínculo anterior é obrigatória para calcular o próximo ciclo.");
    }

    // Calcular o próximo vencimento projetado para fins de validação interna
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
  }

  // --- INICIALIZAÇÃO DA TRANSAÇÃO PROGRAMÁTICA ---
  try {
    // 4. Primeira Escrita: Resetar o vínculo principal para "pendente"
    const { error: updateErr } = await supabase
      .from("company_alvaras")
      .update({
        data_emissao: null,
        data_vencimento: null,
        status: "pendente",
        updated_at: new Date().toISOString(),
      })
      .eq("id", caLinkId);

    if (updateErr) {
      throw new Error(`Falha no reset do vínculo principal: ${updateErr.message}`);
    }

    // 5. Segunda Escrita: Inserir a nova tarefa pendente
    const { error: insertErr } = await supabase
      .from("alvara_tasks")
      .insert({
        company_alvara_id: caLinkId,
        due_date: nextDue,
        inicio_obrigatorio_ate: inicioOb,
        status: "pendente",
        title: null,
      });

    if (insertErr) {
      throw new Error(`Falha na inserção da próxima tarefa de renovação: ${insertErr.message}`);
    }

    // Sucesso absoluto!
    return {
      success: true,
      nextDueDate: nextDue,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[LIFECYCLE RENEWAL ROLBACK TRIGGERED] Erro detectado: ${errMessage}. Iniciando reversão...`);

    // --- PROGRAMMATIC ROLLBACK ---
    try {
      const { error: rollbackErr } = await supabase
        .from("company_alvaras")
        .update(originalState)
        .eq("id", caLinkId);

      if (rollbackErr) {
        throw new Error(`Erro na reversão do vínculo: ${rollbackErr.message}`);
      }

      console.log(`[LIFECYCLE ROLLBACK SUCCESS] Vínculo ${caLinkId} revertido com sucesso para o estado original.`);
    } catch (rollbackFailedErr) {
      // FALHA CRÍTICA NO ROLLBACK (Perda de integridade do banco!)
      const rollbackFailMessage = rollbackFailedErr instanceof Error ? rollbackFailedErr.message : String(rollbackFailedErr);
      const criticalMsg = `FALHA DUPLA CRÍTICA: A segunda escrita falhou e o rollback também falhou! O vínculo ficou resetado sem a tarefa criada. Erro do Rollback: ${rollbackFailMessage}. Erro Original: ${errMessage}`;

      await persistirErroLifecycle(
        supabase,
        caLinkId,
        criticalMsg,
        originalState,
        { status: "pendente", data_emissao: null, data_vencimento: null }
      );
    }

    // Propaga o erro original para a API tratar
    throw new Error(`Falha no processamento da renovação automática. Transação desfeita: ${errMessage}`);
  }
}

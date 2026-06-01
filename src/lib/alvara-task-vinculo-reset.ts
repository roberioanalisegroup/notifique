import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sob o novo modelo centrado em documentos (Fase 1-9), os vínculos de alvarás
 * representam configurações permanentes e os documentos vigentes residem em
 * company_alvara_documents. Não realizamos mais resets físicos de datas do vínculo
 * principal quando tarefas são excluídas. Esta função agora retorna falso de forma segura
 * e não altera colunas depreciadas da tabela company_alvaras.
 */
export async function resetCompanyAlvaraIfNoActiveTasks(
  supabase: SupabaseClient,
  companyAlvaraId: string
): Promise<{ reset: boolean }> {
  // Retorna falso com segurança para manter compatibilidade de assinatura com rotas administrativas legadas.
  return { reset: false };
}


import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Se já não há tarefas “ativas” (nem pendente nem concluída) para o vínculo,
 * limpa datas no vínculo para não reaparecer emissão/vencimento antigos ao gerar nova tarefa.
 * Linhas só «canceladas» não impedem o reset (permitem novo 1.º ciclo limpo).
 */
export async function resetCompanyAlvaraIfNoActiveTasks(
  supabase: SupabaseClient,
  companyAlvaraId: string
): Promise<{ reset: boolean }> {
  const { count, error } = await supabase
    .from("alvara_tasks")
    .select("id", { count: "exact", head: true })
    .eq("company_alvara_id", companyAlvaraId)
    .neq("status", "cancelada");

  if (error) {
    throw new Error(error.message);
  }
  if ((count ?? 0) > 0) {
    return { reset: false };
  }

  const { error: uErr } = await supabase
    .from("company_alvaras")
    .update({
      data_emissao: null,
      data_vencimento: null,
      status: "pendente",
      updated_at: new Date().toISOString(),
    })
    .eq("id", companyAlvaraId);

  if (uErr) {
    throw new Error(uErr.message);
  }
  return { reset: true };
}

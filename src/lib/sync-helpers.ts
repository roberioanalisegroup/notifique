import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCNPJData, mapBrasilAPIToCompany } from "@/lib/cnpj-service";
import { cleanCNPJ } from "@/lib/utils";
import type { Company, CompanyCadastroTipo, SyncConfig } from "@/types";

export const SYNC_CONFIG_ID = "00000000-0000-0000-0000-000000000001";

export async function upsertCompanyByCNPJ(
  supabase: SupabaseClient,
  cnpj: string,
  options?: { cadastroTipo?: CompanyCadastroTipo }
): Promise<{
  company: Company | null;
  error: string | null;
  notFound: boolean;
}> {
  const clean = cleanCNPJ(cnpj);
  if (clean.length !== 14) {
    return { company: null, error: "CNPJ inválido", notFound: false };
  }

  const cadastroTipo: CompanyCadastroTipo =
    options?.cadastroTipo === "mei" ? "mei" : "cnpj";

  const { data: apiData, error: apiError } = await fetchCNPJData(clean);
  if (apiError && !apiData) {
    const notFound = apiError === "CNPJ não encontrado";
    const sync_status = notFound ? "not_found" : "error";
    await supabase.from("companies").upsert(
      {
        cadastro_tipo: cadastroTipo,
        numero_documento: clean,
        cnpj: clean,
        sync_status,
        sync_error: apiError,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "numero_documento" }
    );
    return { company: null, error: apiError, notFound };
  }

  if (!apiData) {
    return { company: null, error: apiError ?? "Resposta vazia", notFound: false };
  }

  const mapped = mapBrasilAPIToCompany(apiData);
  const { data, error } = await supabase
    .from("companies")
    .upsert(
      {
        ...mapped,
        cadastro_tipo: cadastroTipo,
        numero_documento: clean,
        cnpj: clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "numero_documento" }
    )
    .select()
    .single();

  if (error) {
    return { company: null, error: error.message, notFound: false };
  }
  return { company: data as Company, error: null, notFound: false };
}

export async function fetchCompaniesForSync(
  supabase: SupabaseClient,
  config: SyncConfig | null
): Promise<Company[]> {
  let q = supabase.from("companies").select("*").is("archived_at", null);
  if (config?.date_start) {
    q = q.gte("data_abertura", config.date_start);
  }
  if (config?.date_end) {
    q = q.lte("data_abertura", config.date_end);
  }
  if (config?.only_active) {
    q = q.eq("situacao_cadastral", "ATIVA");
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data as Company[];
}

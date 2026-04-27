import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com service role — apenas em rotas server-side confiáveis
 * (ex.: sync-all com verificação de Authorization).
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configuração Supabase incompleta");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

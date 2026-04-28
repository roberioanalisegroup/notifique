import { createClient } from "@supabase/supabase-js";

/**
 * Confirma a palavra-passe do utilizador contra o Supabase Auth (sem alterar a sessão da API).
 */
export async function verifyUserPasswordMatchesSession(
  email: string,
  password: string,
  expectedUserId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, message: "Configuração Supabase em falta no servidor." };
  }
  const client = createClient(url, anon);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, message: "Palavra-passe incorreta." };
  }
  if (data.user.id !== expectedUserId) {
    return { ok: false, message: "Identidade não corresponde à sessão." };
  }
  return { ok: true };
}

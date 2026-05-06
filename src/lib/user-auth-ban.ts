import type { SupabaseClient } from "@supabase/supabase-js";

/** Ban longo até ser reativado (Go duration; dias em horas — ~100 anos). */
const BAN_WHILE_INACTIVE = "876000h";

/**
 * Alinha Supabase Auth com `is_active` no perfil: inativo ⇒ banimento; ativo ⇒ remove banimento.
 */
export async function syncAuthBanWithActiveFlag(
  admin: SupabaseClient,
  userId: string,
  isActive: boolean
): Promise<{ error: string } | { error: null }> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: isActive ? "none" : BAN_WHILE_INACTIVE,
  });
  if (error) {
    return { error: error.message };
  }
  return { error: null };
}

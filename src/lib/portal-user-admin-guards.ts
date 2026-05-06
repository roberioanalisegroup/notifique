import type { SupabaseClient } from "@supabase/supabase-js";

export async function countActiveAdmins(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

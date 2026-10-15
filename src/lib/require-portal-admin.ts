import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Garante que o utilizador autenticado tem role `admin` em `profiles`.
 * Usar antes de operações com service role (gestão de utilizadores, etc.).
 */
export async function requirePortalAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .single();

  // Admin desativado não usa as operações com service role (nem para se reativar).
  if (error || profile?.role !== "admin" || profile?.is_active === false) {
    return NextResponse.json(
      { error: "Acesso negado. Apenas administradores podem utilizar esta operação." },
      { status: 403 }
    );
  }
  return null;
}

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidServiceRoleToken, getBearerToken } from "@/lib/service-role-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

function isServiceRoleRequest(request: Request): boolean {
  return isValidServiceRoleToken(getBearerToken(request));
}

/**
 * Para rotas de API: retorna cliente Supabase e usuário.
 * syncRoute: use true em POST /api/companies/sync-all (aceita Bearer service role).
 */
export async function getSupabaseForRequest(
  request: NextRequest,
  options?: { allowServiceRole?: boolean }
): Promise<
  | { supabase: SupabaseClient; userId: string; isServiceRole: false }
  | { supabase: SupabaseClient; userId: null; isServiceRole: true }
  | { error: Response }
> {
  if (options?.allowServiceRole && isServiceRoleRequest(request)) {
    try {
      return {
        supabase: createServiceRoleClient(),
        userId: null,
        isServiceRole: true,
      };
    } catch {
      return {
        error: Response.json(
          { error: "Configuração do servidor Supabase inválida (service role)." },
          { status: 500 }
        ),
      };
    }
  }

  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: Response.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }

  return { supabase, userId: user.id, isServiceRole: false };
}

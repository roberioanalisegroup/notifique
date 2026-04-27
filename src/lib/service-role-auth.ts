import type { NextRequest } from "next/server";

/**
 * Extrai o token do header Authorization: Bearer <token>
 */
export function getBearerToken(request: Request | NextRequest): string | null {
  const h = request.headers.get("authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return m[1]?.trim() ?? null;
}

/**
 * O pedido traz a service role key correta (comparada em texto plano; evitar vazar em logs).
 */
export function isValidServiceRoleToken(token: string | null): boolean {
  if (!token) return false;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return false;
  return token === key;
}

/**
 * true se o utilizador tem sessão OU envia o Bearer de service role válido.
 * Usado em middleware (Edge) e alinhado com getSupabaseForRequest nas route handlers.
 */
export function canAccessSyncAll(
  request: Request | NextRequest,
  hasUser: boolean
): boolean {
  if (hasUser) return true;
  return isValidServiceRoleToken(getBearerToken(request));
}

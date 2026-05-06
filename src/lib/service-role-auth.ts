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

function constantTimeEqual(a: string, b: string): boolean {
  // Implementação isomórfica (funciona no Edge, sem node:crypto).
  // Evita early-return e minimiza timing leaks.
  const aLen = a.length;
  const bLen = b.length;
  const max = Math.max(aLen, bLen);
  let diff = aLen ^ bLen;
  for (let i = 0; i < max; i++) {
    const ac = i < aLen ? a.charCodeAt(i) : 0;
    const bc = i < bLen ? b.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
}

/**
 * O pedido traz a service role key correta (comparada em texto plano; evitar vazar em logs).
 */
export function isValidServiceRoleToken(token: string | null): boolean {
  if (!token) return false;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return false;
  return constantTimeEqual(token, key);
}

export function getCronTimestampHeader(request: Request | NextRequest): string | null {
  return request.headers.get("x-notifique-timestamp");
}

export function getCronSignatureHeader(request: Request | NextRequest): string | null {
  return request.headers.get("x-notifique-signature");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Assinatura simples para cron sem enviar service role:
 * signature = sha256hex(`${timestamp}.${secret}`)
 *
 * - `timestamp` em ms (Date.now()).
 * - Janela de tolerância (default 5 min) para mitigar replay.
 */
export async function isValidCronSignature(
  request: Request | NextRequest,
  options?: { maxSkewMs?: number }
): Promise<boolean> {
  const secret = process.env.CRON_HMAC_SECRET;
  if (!secret) return false;

  const tsRaw = getCronTimestampHeader(request);
  const sig = getCronSignatureHeader(request);
  if (!tsRaw || !sig) return false;

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || ts <= 0) return false;

  const maxSkewMs = options?.maxSkewMs ?? 5 * 60 * 1000;
  const now = Date.now();
  if (Math.abs(now - ts) > maxSkewMs) return false;

  const expected = await sha256Hex(`${tsRaw}.${secret}`);
  return constantTimeEqual(sig, expected);
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
  // Obs: HMAC é async, então aqui mantemos só o Bearer para o middleware (Edge).
  // A rota `/api/companies/sync-all` aceita Bearer OU assinatura HMAC.
  return isValidServiceRoleToken(getBearerToken(request));
}

import type { NextRequest } from "next/server";

/** Host público efetivo (X-Forwarded-Host atrás de proxy reverso). */
export function getEffectiveHost(request: NextRequest): string | null {
  const xf = request.headers.get("x-forwarded-host");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("host");
}

/** Origem esperada para este pedido (scheme + host, sem path). */
export function getExpectedOrigin(request: NextRequest): string | null {
  const host = getEffectiveHost(request);
  if (!host) return null;
  const protoHeader = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  let scheme: string;
  if (protoHeader === "https" || protoHeader === "http") {
    scheme = protoHeader;
  } else {
    scheme = request.nextUrl.protocol === "https:" ? "https" : "http";
  }
  return `${scheme}://${host}`;
}

function collectAllowedOrigins(request: NextRequest): Set<string> {
  const allowed = new Set<string>();
  const expected = getExpectedOrigin(request);
  if (expected) {
    try {
      allowed.add(new URL(expected).origin);
    } catch {
      /* ignore */
    }
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      /* ignore */
    }
  }
  const extra = process.env.CSRF_ALLOWED_ORIGINS?.split(",") ?? [];
  for (const raw of extra) {
    const t = raw.trim();
    if (!t) continue;
    try {
      allowed.add(new URL(t).origin);
    } catch {
      /* ignore */
    }
  }
  return allowed;
}

/**
 * Valida Origin em pedidos mutáveis do browser contra a origem esperada deste servidor.
 * Rejeita comparações por substring (ex.: attacker-victim.com vs victim.com).
 */
export function isAllowedBrowserOrigin(request: NextRequest): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return true;
  try {
    const origin = new URL(originHeader).origin;
    return collectAllowedOrigins(request).has(origin);
  } catch {
    return false;
  }
}

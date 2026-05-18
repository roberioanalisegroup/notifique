import { isAllowedBrowserOrigin } from "@/lib/request-origin";
import { type NextRequest, NextResponse } from "next/server";

export function isProtectedApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/") && pathname !== "/api/csp-report";
}

/** Bloqueia pedidos cross-origin à API fora da lista de confiança. */
export function hasDisallowedCrossOrigin(request: NextRequest): boolean {
  if (!isProtectedApiPath(request.nextUrl.pathname)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return !isAllowedBrowserOrigin(request);
}

const API_ALLOW_METHODS = "GET, POST, PATCH, PUT, DELETE, OPTIONS";
const API_ALLOW_HEADERS = "Content-Type, Authorization, X-Requested-With";

/**
 * APIs do portal são same-origin; CORS explícito só para origens já validadas
 * (app + CSRF_ALLOWED_ORIGINS). Nunca envia `*`.
 */
export function applyApiCorsHeaders(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return response;

  const origin = request.headers.get("origin");
  if (!origin || !isAllowedBrowserOrigin(request)) {
    response.headers.set("Vary", "Origin");
    return response;
  }

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Vary", "Origin");

  if (request.method === "OPTIONS") {
    response.headers.set("Access-Control-Allow-Methods", API_ALLOW_METHODS);
    response.headers.set("Access-Control-Allow-Headers", API_ALLOW_HEADERS);
    response.headers.set("Access-Control-Max-Age", "86400");
  }

  return response;
}

/** Respostas JSON da API não devem ser cacheadas em proxies partilhados. */
export function applyApiCacheHeaders(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  if (!request.nextUrl.pathname.startsWith("/api/")) return response;
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function applyApiResponseHeaders(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  return applyApiCacheHeaders(request, applyApiCorsHeaders(request, response));
}

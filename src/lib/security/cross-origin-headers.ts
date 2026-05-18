import { type NextRequest, NextResponse } from "next/server";

/** Política de permissões do browser (features perigosas desativadas). */
export const PERMISSIONS_POLICY =
  "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), usb=(), xr-spatial-tracking=()";

export type CorpMode = "same-origin" | "cross-origin";

function resolveCorpMode(request: NextRequest): CorpMode {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/api/companies/export" && searchParams.get("format") === "pdf") {
    return "cross-origin";
  }
  return "same-origin";
}

/**
 * Mitigações Spectre / isolamento de contexto (MDN practical guides).
 * COEP `require-corp` não é aplicado — quebra fetch credenciado ao Supabase.
 */
export function applyCrossOriginHeaders(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  const corp = resolveCorpMode(request);
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Resource-Policy", corp);
  return response;
}

/** Cabeçalhos legados / endurecimento adicional (OWASP Secure Headers). */
export function applyLegacyHardeningHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-XSS-Protection", "0");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  return response;
}

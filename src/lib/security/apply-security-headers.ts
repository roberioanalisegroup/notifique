import { applyApiResponseHeaders } from "@/lib/security/api-cors";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { getReportingEndpointsHeader } from "@/lib/security/csp-reporting";
import { type NextRequest, NextResponse } from "next/server";

export const NONCE_HEADER = "x-nonce";

export function createRequestNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function requestHeadersWithNonce(
  request: NextRequest,
  nonce: string
): Headers {
  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  return headers;
}

/** Aplica CSP (enforcement + Report-Only) e repassa nonce ao App Router. */
export function applySecurityHeaders(
  request: NextRequest,
  response: NextResponse,
  nonce: string
): NextResponse {
  const enforcing = buildContentSecurityPolicy({ nonce, reportOnly: false });
  const reportOnly = buildContentSecurityPolicy({ nonce, reportOnly: true });

  response.headers.set("Content-Security-Policy", enforcing);
  response.headers.set("Content-Security-Policy-Report-Only", reportOnly);

  const reportingEndpoints = getReportingEndpointsHeader();
  if (reportingEndpoints) {
    response.headers.set("Reporting-Endpoints", reportingEndpoints);
  }

  applyApiResponseHeaders(request, response);

  const existing = response.headers.get(NONCE_HEADER);
  if (!existing) {
    response.headers.set(NONCE_HEADER, nonce);
  }

  return response;
}

export function nextWithSecurity(
  request: NextRequest,
  nonce: string,
  init?: { headers?: Headers }
): NextResponse {
  const headers = init?.headers ?? requestHeadersWithNonce(request, nonce);
  const response = NextResponse.next({
    request: { headers },
  });
  return applySecurityHeaders(request, response, nonce);
}

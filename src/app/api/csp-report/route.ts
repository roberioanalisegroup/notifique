import { insertAuditLog } from "@/lib/audit-log";
import { parseCspReportBody } from "@/lib/security/csp-reporting";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const MAX_BODY = 50_000;

function clientIp(request: Request): string | null {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

/**
 * Coletor CSP (report-uri + Reporting API / report-to).
 * Público, sem sessão; corpo limitado e validado.
 */
export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY) {
    return new Response(null, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType &&
    !contentType.includes("application/json") &&
    !contentType.includes("application/csp-report") &&
    !contentType.includes("application/reports+json")
  ) {
    return new Response(null, { status: 415 });
  }

  let raw = "";
  try {
    raw = await request.text();
    if (raw.length > MAX_BODY) {
      return new Response(null, { status: 413 });
    }
    if (!raw) {
      return new Response(null, { status: 204 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      return new Response(null, { status: 400 });
    }

    const report = parseCspReportBody(body);
    const metadata = {
      report: report ?? { rawPreview: raw.slice(0, 500) },
      user_agent: request.headers.get("user-agent"),
    };

    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event_type: "csp_violation",
        ip: clientIp(request),
        metadata,
      })
    );

    try {
      const admin = createServiceRoleClient();
      void insertAuditLog(admin, {
        event_type: "csp_violation",
        ip: clientIp(request),
        user_agent: request.headers.get("user-agent"),
        metadata,
      });
    } catch {
      /* service role indisponível em build local */
    }
  } catch {
    return new Response(null, { status: 400 });
  }

  return new Response(null, { status: 204 });
}

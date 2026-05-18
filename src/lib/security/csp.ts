import {
  CSP_REPORT_ENDPOINT_NAME,
  getCspReportUrl,
} from "@/lib/security/csp-reporting";

/** Origens Supabase (REST + Realtime) para connect-src no browser. */
export function getSupabaseConnectSources(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return [];
  try {
    const { origin, host } = new URL(raw);
    return [origin, `wss://${host}`];
  } catch {
    return [];
  }
}

export type BuildCspOptions = {
  nonce: string;
  /** Política em modo relatório (ex.: style-src sem unsafe-inline). */
  reportOnly?: boolean;
};

/**
 * CSP endurecida: script com nonce + strict-dynamic; connect-src explícito.
 * style-src mantém unsafe-inline (exigido por Next/Tailwind); Report-Only monitora remoção futura.
 */
export function buildContentSecurityPolicy(options: BuildCspOptions): string {
  const { nonce, reportOnly = false } = options;
  const isDev = process.env.NODE_ENV !== "production";
  const supabaseSources = getSupabaseConnectSources();
  const connectSrc = ["'self'", ...supabaseSources].join(" ");

  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const styleSrc = reportOnly ? "'self'" : "'self' 'unsafe-inline'";

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "font-src 'self'",
    "worker-src 'self' blob:",
  ];

  if (!isDev) {
    directives.push("upgrade-insecure-requests", "block-all-mixed-content");
  }

  const reportUrl = getCspReportUrl();
  if (reportUrl) {
    directives.push(`report-uri ${reportUrl}`);
    directives.push(`report-to ${CSP_REPORT_ENDPOINT_NAME}`);
  }

  return directives.join("; ");
}

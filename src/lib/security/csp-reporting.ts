/** Nome do endpoint na diretiva CSP `report-to` e em `Reporting-Endpoints`. */
export const CSP_REPORT_ENDPOINT_NAME = "csp-endpoint";

/** URL absoluta do coletor de violações CSP. */
export function getCspReportUrl(): string | undefined {
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!app) return undefined;
  try {
    return new URL("/api/csp-report", app).href;
  } catch {
    return undefined;
  }
}

/** Valor do cabeçalho `Reporting-Endpoints` (Reporting API). */
export function getReportingEndpointsHeader(): string | undefined {
  const url = getCspReportUrl();
  if (!url) return undefined;
  return `${CSP_REPORT_ENDPOINT_NAME}="${url}"`;
}

export type ParsedCspReport = {
  documentUri?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  blockedUri?: string;
  sourceFile?: string;
  lineNumber?: number;
  disposition?: string;
};

/** Extrai campos úteis de relatórios legados (`csp-report`) ou Reporting API. */
export function parseCspReportBody(body: unknown): ParsedCspReport | null {
  if (!body || typeof body !== "object") return null;

  const root = body as Record<string, unknown>;

  if (Array.isArray(root)) {
    for (const item of root) {
      const parsed = parseCspReportBody(item);
      if (parsed) return parsed;
    }
    return null;
  }

  const legacy = root["csp-report"] as Record<string, unknown> | undefined;
  const report = (legacy ?? root) as Record<string, unknown>;

  const violated =
    typeof report["violated-directive"] === "string"
      ? report["violated-directive"]
      : typeof report["effective-directive"] === "string"
        ? report["effective-directive"]
        : undefined;

  if (!violated && !report["document-uri"] && !report["blocked-uri"]) {
    return null;
  }

  return {
    documentUri:
      typeof report["document-uri"] === "string" ? report["document-uri"] : undefined,
    violatedDirective: violated,
    effectiveDirective:
      typeof report["effective-directive"] === "string"
        ? report["effective-directive"]
        : undefined,
    blockedUri:
      typeof report["blocked-uri"] === "string" ? report["blocked-uri"] : undefined,
    sourceFile:
      typeof report["source-file"] === "string" ? report["source-file"] : undefined,
    lineNumber:
      typeof report["line-number"] === "number" ? report["line-number"] : undefined,
    disposition:
      typeof report["disposition"] === "string" ? report["disposition"] : undefined,
  };
}

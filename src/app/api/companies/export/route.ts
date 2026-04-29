import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  applyCompaniesAlvaraSummarySort,
  parseCompaniesSortParams,
} from "@/lib/companies-list-sort";
import {
  buildEmpresasExportPdf,
  buildEmpresasExportXlsx,
  EMPRESAS_EXPORT_MAX_ROWS,
  type CompanyAlvaraExportRow,
} from "@/lib/empresas-export";
import type { CompanyAlvaraSummary } from "@/types";
import { onlyDigits } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

async function fetchLinksForCompanies(
  supabase: SupabaseClient,
  companyIds: string[]
): Promise<CompanyAlvaraExportRow[]> {
  const chunk = 200;
  const all: CompanyAlvaraExportRow[] = [];
  for (let i = 0; i < companyIds.length; i += chunk) {
    const slice = companyIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("company_alvaras")
      .select(
        `
        id,
        company_id,
        numero,
        data_emissao,
        data_vencimento,
        status,
        observacoes,
        alvaras (
          id,
          name,
          frequencia,
          orgao_emissor,
          alvara_groups ( id, name )
        )
      `
      )
      .in("company_id", slice);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      all.push(row as unknown as CompanyAlvaraExportRow);
    }
  }
  return all;
}

function groupLinksByCompany(links: CompanyAlvaraExportRow[]): Map<string, CompanyAlvaraExportRow[]> {
  const m = new Map<string, CompanyAlvaraExportRow[]>();
  for (const L of links) {
    const arr = m.get(L.company_id) ?? [];
    arr.push(L);
    m.set(L.company_id, arr);
  }
  return m;
}

function filenameStem(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}${mo}${da}-${h}${mi}`;
}

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = request.nextUrl;
  const format = searchParams.get("format")?.toLowerCase()?.trim();

  if (format !== "xlsx" && format !== "pdf") {
    return NextResponse.json({ error: "Use format=xlsx ou format=pdf" }, { status: 400 });
  }

  try {
    const params = searchParams;
    const search = (params.get("search") ?? "").trim();
    const situacao = params.get("situacao");
    const municipios = params.getAll("municipio").map((m) => m.trim()).filter(Boolean);
    const sync_status = params.get("sync_status");
    const uf = params.get("uf")?.trim() || null;

    const arquivadasOnly =
      params.get("arquivadas") === "1" || params.get("arquivadas") === "true";

    let q = supabase.from("companies_alvara_summary").select("*");

    q = arquivadasOnly ? q.not("archived_at", "is", null) : q.is("archived_at", null);

    if (search) {
      const digits = onlyDigits(search);
      if (digits.length === 14 || digits.length === 11) {
        q = q.eq("numero_documento", digits);
      } else {
        const esc = escapeIlikePattern(search);
        const parts = [
          `razao_social.ilike.%${esc}%`,
          `nome_fantasia.ilike.%${esc}%`,
          `codigo_empresa.ilike.%${esc}%`,
        ];
        const partial = onlyDigits(search);
        if (partial.length > 0) {
          parts.push(`numero_documento.ilike.%${partial}%`);
          parts.push(`cnpj.ilike.%${partial}%`);
        }
        q = q.or(parts.join(","));
      }
    }
    if (situacao) q = q.eq("situacao_cadastral", situacao);
    if (municipios.length > 0) q = q.in("municipio", municipios);
    if (sync_status) q = q.eq("sync_status", sync_status);
    if (uf) q = q.eq("uf", uf);

    const { sort, order } = parseCompaniesSortParams(
      params.get("sort"),
      params.get("order")
    );
    q = applyCompaniesAlvaraSummarySort(q, sort, order);
    q = q.limit(EMPRESAS_EXPORT_MAX_ROWS + 1);

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as CompanyAlvaraSummary[];
    if (rows.length > EMPRESAS_EXPORT_MAX_ROWS) {
      return NextResponse.json(
        {
          error: `Limite de exportação: no máximo ${EMPRESAS_EXPORT_MAX_ROWS} empresas. Ajuste os filtros e tente de novo.`,
        },
        { status: 413 }
      );
    }

    const ids = rows.map((r) => r.id);
    let linksParsed: CompanyAlvaraExportRow[] = [];
    if (ids.length > 0) {
      linksParsed = await fetchLinksForCompanies(supabase, ids);
    }
    const byCompany = groupLinksByCompany(linksParsed);

    const stem = filenameStem();
    const dispositionBase = format === "xlsx" ? "empresas-alvaras" : "empresas-alvaras";
    const fileName = `${dispositionBase}-${stem}.${format === "xlsx" ? "xlsx" : "pdf"}`;

    let body: Uint8Array;
    const headers = new Headers();
    headers.set(
      "Content-Disposition",
      `attachment; filename="${fileName.replace(/[^\w.\-()+ ]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    if (format === "xlsx") {
      const buf = await buildEmpresasExportXlsx(rows, byCompany);
      headers.set(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      body = buf;
    } else {
      const buf = buildEmpresasExportPdf(rows, byCompany);
      headers.set("Content-Type", "application/pdf");
      body = buf;
    }

    return new NextResponse(body as BodyInit, { status: 200, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gerar exportação";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

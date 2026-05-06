import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  applyCnaeBuscaOrFilter,
  escapeIlikePattern,
  normalizeCnaeTokensFromSearchParams,
} from "@/lib/companies-cnae-filter";
import {
  applyCompaniesAlvaraSummarySort,
  parseCompaniesSortParams,
} from "@/lib/companies-list-sort";
import { upsertCompanyByCNPJ } from "@/lib/sync-helpers";
import { normalizeDocumentoForTipo, onlyDigits, sanitizeText } from "@/lib/utils";
import type { Company, CompanyCadastroTipo } from "@/types";
import { NextRequest, NextResponse } from "next/server";

function parseParam(sp: string | null, def: number, min: number, max: number) {
  const n = sp ? parseInt(sp, 10) : def;
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = request.nextUrl;
  const page = parseParam(searchParams.get("page"), 1, 1, 100_000);
  const limit = parseParam(searchParams.get("limit"), 20, 1, 100);
  const search = (searchParams.get("search") ?? "").trim();
  const situacao = searchParams.get("situacao");
  const municipios = searchParams
    .getAll("municipio")
    .map((m) => m.trim())
    .filter(Boolean);
  const sync_status = searchParams.get("sync_status");
  const uf = searchParams.get("uf")?.trim() || null;

  const arquivadasOnly =
    searchParams.get("arquivadas") === "1" || searchParams.get("arquivadas") === "true";

  const cnaeCodes = normalizeCnaeTokensFromSearchParams(searchParams);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from("companies_alvara_summary")
    .select("*", { count: "exact" });

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
  if (cnaeCodes.length > 0) {
    q = applyCnaeBuscaOrFilter(q, cnaeCodes);
  }

  const { sort, order } = parseCompaniesSortParams(
    searchParams.get("sort"),
    searchParams.get("order")
  );
  q = applyCompaniesAlvaraSummarySort(q, sort, order);
  q = q.range(from, to);

  const { data, error, count } = await q;

  if (error) {
    return NextResponse.json(
      { error: error.message, companies: [], count: 0 },
      { status: 500 }
    );
  }

  return NextResponse.json({
    companies: data,
    count: count ?? 0,
    page,
    limit,
  });
}

export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: {
    cadastro_tipo?: CompanyCadastroTipo;
    documento?: string;
    numero_documento?: string;
    cnpj?: string;
    sincronizar_receita?: boolean;
    razao_social?: string | null;
    nome_fantasia?: string | null;
    situacao_cadastral?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    uf?: string | null;
    cep?: string | null;
    telefone?: string | null;
    email?: string | null;
    codigo_empresa?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const tipo: CompanyCadastroTipo = body.cadastro_tipo ?? "cnpj";
  const raw =
    body.numero_documento ?? body.documento ?? body.cnpj ?? "";
  const norm = normalizeDocumentoForTipo(tipo, raw);
  if (!norm.ok) {
    return NextResponse.json({ error: norm.message }, { status: 400 });
  }

  const cnpjCol = norm.value.length === 14 ? norm.value : null;
  const sincronizar =
    body.sincronizar_receita === true &&
    (tipo === "cnpj" || tipo === "mei") &&
    cnpjCol != null;

  const baseRow = {
    cadastro_tipo: tipo,
    numero_documento: norm.value,
    cnpj: cnpjCol,
    razao_social: sanitizeText(body.razao_social),
    nome_fantasia: sanitizeText(body.nome_fantasia),
    situacao_cadastral: sanitizeText(body.situacao_cadastral),
    logradouro: body.logradouro?.trim() || null,
    numero: body.numero?.trim() || null,
    complemento: body.complemento?.trim() || null,
    bairro: body.bairro?.trim() || null,
    municipio: body.municipio?.trim() || null,
    uf: body.uf?.trim() ? body.uf.trim().toUpperCase().slice(0, 2) : null,
    cep: body.cep?.trim() ? onlyDigits(body.cep).slice(0, 8) || null : null,
    telefone: body.telefone?.trim() || null,
    email: body.email?.trim() || null,
    ...(Object.prototype.hasOwnProperty.call(body, "codigo_empresa")
      ? {
          codigo_empresa:
            typeof body.codigo_empresa === "string"
              ? body.codigo_empresa.trim().slice(0, 80) || null
              : null,
        }
      : {}),
    user_id: auth.userId,
    sync_status: sincronizar ? "pending" : "manual",
    sync_error: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("companies").insert(baseRow).select().single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Já existe cadastro com este identificador" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let company = data as Company;
  let syncWarning: string | null = null;

  if (sincronizar && cnpjCol) {
    const { company: synced, error: syncErr } = await upsertCompanyByCNPJ(supabase, cnpjCol, {
      cadastroTipo: tipo === "mei" ? "mei" : "cnpj",
      userId: auth.userId,
    });
    if (synced) company = synced;
    else if (syncErr) syncWarning = syncErr;
  }

  return NextResponse.json({ company, syncWarning });
}

import type { BrasilAPICNPJ, Company } from "@/types";
import { cleanCNPJ } from "@/lib/utils";

const BRASIL_API_BASE = "https://brasilapi.com.br/api/cnpj/v1";

/** BrasilAPI / Cloudflare costumam devolver 403 para fetch sem User-Agent “de navegador”. */
function brasilApiFetchHeaders(): HeadersInit {
  const ua =
    process.env.BRASIL_API_USER_AGENT?.trim() ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  return {
    Accept: "application/json",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "User-Agent": ua,
  };
}

function parseBrasilDate(value: string | undefined | null): string | null {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeSituacaoCadastral(d: BrasilAPICNPJ): string | null {
  const desc = d.descricao_situacao_cadastral;
  if (desc != null && String(desc).trim() !== "") {
    return String(desc).trim();
  }
  const s = d.situacao_cadastral;
  if (s == null) return null;
  if (typeof s === "string") return s;
  // Códigos comuns (Receita) — fallback quando não vem descrição
  const codeMap: Record<number, string> = {
    1: "NULA",
    2: "ATIVA",
    3: "SUSPENSA",
    4: "INAPTA",
    8: "BAIXADA",
  };
  return codeMap[s] ?? String(s);
}

function normalizeAtividadePrincipal(d: BrasilAPICNPJ): string | null {
  const ap = d.atividade_principal;
  if (ap) {
    const first = Array.isArray(ap) ? ap[0] : ap;
    if (first?.codigo != null && first.descricao != null) {
      return `${String(first.codigo)} — ${String(first.descricao)}`;
    }
  }
  if (d.cnae_fiscal != null && d.cnae_fiscal_descricao) {
    return `${d.cnae_fiscal} — ${d.cnae_fiscal_descricao}`;
  }
  return null;
}

function normalizeAtividadesSecundarias(
  d: BrasilAPICNPJ
): Array<{ codigo: string; descricao: string }> {
  if (d.atividades_secundarias?.length) {
    return d.atividades_secundarias.map((x) => ({
      codigo: String(x.codigo),
      descricao: x.descricao,
    }));
  }
  if (d.cnaes_secundarios?.length) {
    return d.cnaes_secundarios.map((x) => ({
      codigo: String((x as { codigo: number | string }).codigo),
      descricao: (x as { descricao: string }).descricao,
    }));
  }
  return [];
}

export function mapBrasilAPIToCompany(data: BrasilAPICNPJ): Partial<Company> {
  const atividade_principal = normalizeAtividadePrincipal(data);
  const atividades_secundarias = normalizeAtividadesSecundarias(data);

  return {
    cnpj: cleanCNPJ(data.cnpj),
    razao_social: data.razao_social ?? null,
    nome_fantasia: data.nome_fantasia ?? null,
    situacao_cadastral: normalizeSituacaoCadastral(data),
    data_situacao: parseBrasilDate(
      (data.data_situacao_cadastral as string | null | undefined) ?? undefined
    ),
    natureza_juridica: data.natureza_juridica ?? null,
    atividade_principal,
    atividades_secundarias: atividades_secundarias as unknown,
    logradouro: data.logradouro ?? null,
    numero: data.numero ?? null,
    complemento: data.complemento ?? null,
    bairro: data.bairro ?? null,
    municipio: data.municipio ?? null,
    uf: data.uf ?? null,
    cep: data.cep != null ? String(data.cep).replace(/\D/g, "") : null,
    telefone: data.ddd_telefone_1 ?? null,
    email: data.email ?? null,
    capital_social: data.capital_social ?? null,
    porte: data.porte ?? null,
    opcao_simples: data.opcao_pelo_simples ?? null,
    opcao_mei: data.opcao_pelo_mei ?? null,
    data_abertura: parseBrasilDate(data.data_inicio_atividade),
    raw_data: data as unknown as Record<string, unknown>,
    last_sync_at: new Date().toISOString(),
    sync_status: "success",
    sync_error: null,
  };
}

export async function fetchCNPJData(
  cnpj: string
): Promise<{ data: BrasilAPICNPJ | null; error: string | null }> {
  const cnpjLimpo = cleanCNPJ(cnpj);
  if (cnpjLimpo.length !== 14) {
    return { data: null, error: "CNPJ inválido (deve ter 14 dígitos)" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${BRASIL_API_BASE}/${cnpjLimpo}`, {
      signal: controller.signal,
      headers: brasilApiFetchHeaders(),
      cache: "no-store",
    });

    if (res.status === 404) {
      return { data: null, error: "CNPJ não encontrado" };
    }
    if (res.status === 403) {
      return {
        data: null,
        error:
          "BrasilAPI recusou a consulta (403). Tente definir BRASIL_API_USER_AGENT no .env com um User-Agent de navegador, ou aguarde e tente de novo.",
      };
    }
    if (res.status === 429) {
      return { data: null, error: "Rate limit atingido" };
    }
    if (!res.ok) {
      return {
        data: null,
        error: `Erro na consulta (${res.status})`,
      };
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return { data: null, error: "Resposta inválida da BrasilAPI (não é JSON)" };
    }
    if (json == null || typeof json !== "object" || !("cnpj" in json)) {
      return { data: null, error: "Resposta inesperada da BrasilAPI" };
    }
    return { data: json as BrasilAPICNPJ, error: null };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { data: null, error: "Tempo esgotado ao consultar CNPJ" };
    }
    return { data: null, error: "Falha de rede ao consultar a BrasilAPI" };
  } finally {
    clearTimeout(timeout);
  }
}

export const CNPJ_BATCH_DELAY_MS = 500;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

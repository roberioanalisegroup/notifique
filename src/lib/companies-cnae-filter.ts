import { onlyDigits } from "@/lib/utils";

export const CNAE_FILTER_MAX = 30;
export const CNAE_MIN_DIGITS = 4;
export const CNAE_MAX_DIGITS = 10;

export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Extrai códigos CNAE (só dígitos) a partir de fragmentos de texto ou URL. */
export function normalizeCnaeTokenList(strings: string[]): string[] {
  const out = new Set<string>();
  for (const part of strings) {
    const d = onlyDigits(String(part).trim());
    if (d.length >= CNAE_MIN_DIGITS && d.length <= CNAE_MAX_DIGITS) out.add(d);
    else if (d.length > CNAE_MAX_DIGITS) out.add(d.slice(0, CNAE_MAX_DIGITS));
  }
  return Array.from(out).slice(0, CNAE_FILTER_MAX);
}

export function normalizeCnaeTokensFromSearchParams(searchParams: {
  getAll(name: string): string[];
}): string[] {
  const raw: string[] = [];
  for (const v of searchParams.getAll("cnae")) {
    for (const part of v.split(/[\s,;]+/)) {
      const t = part.trim();
      if (t) raw.push(t);
    }
  }
  return normalizeCnaeTokenList(raw);
}

type QueryWithOr = { or: (filters: string) => unknown };

/** Empresas em que `cnaes_busca` contém qualquer um dos códigos (OR). */
export function applyCnaeBuscaOrFilter<T extends QueryWithOr>(q: T, codes: string[]): T {
  if (codes.length === 0) return q;
  const parts = codes.map((code) => {
    const esc = escapeIlikePattern(code);
    return `cnaes_busca.ilike.%${esc}%`;
  });
  return q.or(parts.join(",")) as T;
}

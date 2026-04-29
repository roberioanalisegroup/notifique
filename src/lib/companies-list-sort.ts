/** Chaves de ordenação aceites em `/api/companies` (listagem e exportação). */
export type CompaniesSortKey =
  | "documento"
  | "codigo"
  | "razao"
  | "municipio"
  | "situacao"
  | "sync"
  | "alvaras";

const SORT_KEYS: CompaniesSortKey[] = [
  "documento",
  "codigo",
  "razao",
  "municipio",
  "situacao",
  "sync",
  "alvaras",
];

export function parseCompaniesSortParams(
  sort: string | null,
  order: string | null
): { sort: CompaniesSortKey; order: "asc" | "desc" } {
  const s = (sort ?? "razao") as CompaniesSortKey;
  const sortOk = SORT_KEYS.includes(s) ? s : "razao";
  const o = order === "desc" ? "desc" : "asc";
  return { sort: sortOk, order: o };
}

type OrderBuilder = {
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ): OrderBuilder;
};

/**
 * Aplica ordenação na query `companies_alvara_summary` e desempate estável por `id`.
 */
export function applyCompaniesAlvaraSummarySort<T extends OrderBuilder>(
  q: T,
  sort: CompaniesSortKey,
  order: "asc" | "desc"
): T {
  const asc = order === "asc";
  const nf = false;
  let r: OrderBuilder = q;
  switch (sort) {
    case "documento":
      r = r.order("numero_documento", { ascending: asc, nullsFirst: nf });
      break;
    case "codigo":
      r = r.order("codigo_empresa", { ascending: asc, nullsFirst: nf });
      break;
    case "razao":
      r = r.order("razao_social", { ascending: asc, nullsFirst: nf });
      break;
    case "municipio":
      r = r
        .order("municipio", { ascending: asc, nullsFirst: nf })
        .order("uf", { ascending: asc, nullsFirst: nf });
      break;
    case "situacao":
      r = r.order("situacao_cadastral", { ascending: asc, nullsFirst: nf });
      break;
    case "sync":
      r = r.order("last_sync_at", { ascending: asc, nullsFirst: nf });
      break;
    case "alvaras":
      r = r.order("total_alvaras", { ascending: asc, nullsFirst: nf });
      break;
    default:
      r = r.order("razao_social", { ascending: true, nullsFirst: nf });
  }
  return r.order("id", { ascending: true }) as T;
}

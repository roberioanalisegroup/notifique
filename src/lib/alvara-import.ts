import {
  ALVARA_FREQUENCIAS,
  FREQUENCIA_LABELS,
  isAlvaraFrequencia,
  isWeekendAdjust,
  validateLegalForFrequencia,
  WEEKEND_ADJUSTS,
  type AlvaraFrequencia,
  type AlvaraLegalDates,
  type WeekendAdjust,
} from "@/lib/alvara-frequency";

export type AlvaraImportRow = Record<string, string | undefined>;

/** Chave para deduplicar nome (minúsculas + trim). */
export function alvaraNameKey(name: string): string {
  return name.trim().toLowerCase();
}

const SEM_GRUPO_TOKENS = new Set([
  "",
  "-",
  "sem grupo",
  "sem_grupo",
  "(sem grupo)",
  "nenhum",
  "sem",
  "s/g",
]);

/** Grupo vazio ou equivalente a “sem grupo” → `group_id` null. */
export function isSemGrupoCell(raw: string | undefined | null): boolean {
  if (raw == null) return true;
  return SEM_GRUPO_TOKENS.has(String(raw).trim().toLowerCase());
}

/**
 * Resolve frequência: slug (`mensal`) ou rótulo em português (“Mensal”, “Decendial”).
 */
export function parseFrequenciaCell(raw: string | undefined | null): AlvaraFrequencia | null {
  if (raw == null || String(raw).trim() === "") return null;
  const t = String(raw)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (isAlvaraFrequencia(t)) return t;
  for (const slug of ALVARA_FREQUENCIAS) {
    const label = FREQUENCIA_LABELS[slug]
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (label === t) return slug;
  }
  return null;
}

/** Slug ou palavras-chave em português / inglês. */
export function parseWeekendCell(raw: string | undefined | null): WeekendAdjust | null {
  if (raw == null || String(raw).trim() === "") return "none";
  const t = String(raw).trim().toLowerCase();
  if (isWeekendAdjust(t)) return t;
  if (t === "nenhum" || t === "sem ajuste" || t === "sem_ajuste") return "none";
  if (t.includes("posterg") || t === "postpone") return "postpone";
  if (t.includes("antecip") || t === "anticipate") return "anticipate";
  return null;
}

function parseOptInt(raw: string | undefined | null): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseInt(String(raw).trim().replace(",", "."), 10);
  if (Number.isNaN(n)) return null;
  return n;
}

export function parseAtivoCell(raw: string | undefined | null): boolean {
  if (raw == null || String(raw).trim() === "") return true;
  const t = String(raw).trim().toLowerCase();
  if (["0", "n", "nao", "não", "false", "off", "inativo"].includes(t)) return false;
  return true;
}

/** Monta data legal com valores do CSV; faltando, usa padrões compatíveis com o formulário. */
export function buildLegalFromImportRow(
  frequencia: AlvaraFrequencia,
  row: AlvaraImportRow
): AlvaraLegalDates {
  const ds = parseOptInt(row.legal_dia_semana ?? row["legal_dia_semana"] ?? row["dia_semana"]);

  switch (frequencia) {
    case "diaria":
      return {
        legal_dia: null,
        legal_mes: null,
        legal_dia_semana: null,
        legal_dias_uteis: null,
      };
    case "semanal":
      return {
        legal_dia: null,
        legal_mes: null,
        legal_dia_semana: ds ?? 1,
        legal_dias_uteis: null,
      };
    case "decendial":
    case "mensal":
    case "bimestral":
    case "trimestral":
    case "semestral":
    case "anual":
      return {
        legal_dia: null,
        legal_mes: null,
        legal_dia_semana: null,
        legal_dias_uteis: null,
      };
    default:
      return {
        legal_dia: null,
        legal_mes: null,
        legal_dia_semana: null,
        legal_dias_uteis: null,
      };
  }
}

export function validateImportRowLegal(
  frequencia: AlvaraFrequencia,
  legal: AlvaraLegalDates
): string | null {
  return validateLegalForFrequencia(frequencia, legal);
}

/** Encontra grupo por nome idêntico ao cadastro (após trim). */
export function resolveGroupIdByExactName(
  groupNameTrimmed: string,
  groups: { id: string; name: string }[]
): string | null {
  const t = groupNameTrimmed.trim();
  const g = groups.find((x) => x.name.trim() === t);
  return g?.id ?? null;
}

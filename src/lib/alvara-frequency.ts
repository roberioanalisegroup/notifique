import { addDays, addMonths, getDay, format } from "date-fns";

/** Data civil (YYYY-MM-DD) sem deslocamento de fuso. */
function parseDateOnly(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  const [y, m, d] = input.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) throw new Error("Data de emissão inválida");
  return new Date(y, m - 1, d);
}

/** Slugs armazenados em `alvaras.frequencia` */
export const ALVARA_FREQUENCIAS = [
  "diaria",
  "semanal",
  "decendial",
  "mensal",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
  "personalizada",
] as const;

export type AlvaraFrequencia = (typeof ALVARA_FREQUENCIAS)[number];

export const FREQUENCIA_LABELS: Record<AlvaraFrequencia, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  decendial: "Decendial",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  personalizada: "Personalizada",
};

export const WEEKEND_ADJUSTS = ["none", "postpone", "anticipate"] as const;
export type WeekendAdjust = (typeof WEEKEND_ADJUSTS)[number];

export const WEEKEND_ADJUST_LABELS: Record<WeekendAdjust, string> = {
  none: "Sem ajuste",
  postpone: "Postergar (para a segunda-feira seguinte)",
  anticipate: "Antecipar (para a sexta-feira anterior)",
};

/** 0 = domingo … 6 = sábado (Date.getDay) */
export const DIAS_SEMANA_OPCOES: { value: number; label: string }[] = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

export const MESES_OPCOES: { value: number; label: string }[] = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

/** Dias úteis a somar (decendial) — valores típicos do formulário */
export const DIAS_UTEIS_OPCOES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30] as const;

const FREQUENCIA_SET = new Set<string>(ALVARA_FREQUENCIAS);
const WEEKEND_SET = new Set<string>(WEEKEND_ADJUSTS);

export function isAlvaraFrequencia(v: string): v is AlvaraFrequencia {
  return FREQUENCIA_SET.has(v);
}

export function isWeekendAdjust(v: string): v is WeekendAdjust {
  return WEEKEND_SET.has(v);
}

export type AlvaraLegalDates = {
  legal_dia: number | null;
  legal_mes: number | null;
  legal_dia_semana: number | null;
  legal_dias_uteis: number | null;
};

/**
 * Ajusta sábado/domingo conforme regra do tipo de alvará.
 * - postpone: domingo → segunda (+1); sábado → segunda (+2)
 * - anticipate: domingo → sexta anterior (-2); sábado → sexta (-1)
 */
export function applyWeekendAdjust(d: Date, mode: WeekendAdjust): Date {
  if (mode === "none") return d;
  const day = getDay(d);
  if (day === 0) {
    if (mode === "postpone") return addDays(d, 1);
    return addDays(d, -2);
  }
  if (day === 6) {
    if (mode === "postpone") return addDays(d, 2);
    return addDays(d, -1);
  }
  return d;
}

/** Soma N dias úteis (não conta sábado nem domingo). */
export function addBusinessDays(from: Date, n: number): Date {
  if (n <= 0) return new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let x = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let added = 0;
  while (added < n) {
    x = addDays(x, 1);
    const day = getDay(x);
    if (day !== 0 && day !== 6) added++;
  }
  return x;
}

function nextWeekdayStrictlyAfter(emission: Date, weekday: number): Date {
  let d = addDays(emission, 1);
  for (let i = 0; i < 14; i++) {
    if (getDay(d) === weekday) return d;
    d = addDays(d, 1);
  }
  throw new Error("Dia da semana inválido");
}

/** Passo em meses para vencimentos calculados só a partir da data de emissão (ciclo). */
function monthsStepRelativo(frequencia: AlvaraFrequencia): number {
  switch (frequencia) {
    case "mensal":
      return 1;
    case "bimestral":
      return 2;
    case "trimestral":
      return 3;
    case "semestral":
      return 6;
    case "anual":
      return 12;
    default:
      return 0;
  }
}

/** Frequências em que não se usa dia/mês fixo: o próximo vencimento soma o período à data de referência (emissão ou vencimento anterior). */
export function isFrequenciaRelativaEmissao(f: AlvaraFrequencia): boolean {
  switch (f) {
    case "mensal":
    case "bimestral":
    case "trimestral":
    case "semestral":
    case "anual":
    case "decendial":
      return true;
    default:
      return false;
  }
}

/** Valida data legal conforme frequência; retorna mensagem ou null se OK. */
export function validateLegalForFrequencia(
  frequencia: AlvaraFrequencia,
  L: AlvaraLegalDates
): string | null {
  const { legal_dia_semana } = L;
  if (isFrequenciaRelativaEmissao(frequencia)) {
    return null;
  }
  switch (frequencia) {
    case "diaria":
      return null;
    case "semanal":
      if (legal_dia_semana == null || legal_dia_semana < 0 || legal_dia_semana > 6) {
        return "Selecione o dia da semana (data legal).";
      }
      return null;
    default:
      return null;
  }
}

/** Próxima data de vencimento a partir da emissão, frequência, data legal e fim de semana. */
export function computeVencimentoDate(
  dataEmissao: string | Date,
  frequencia: AlvaraFrequencia,
  weekendAdjust: WeekendAdjust,
  legal: AlvaraLegalDates,
  diasPersonalizados?: number | null
): Date {
  const emission = parseDateOnly(dataEmissao);
  if (Number.isNaN(emission.getTime())) {
    throw new Error("Data de emissão inválida");
  }

  const err = validateLegalForFrequencia(frequencia, legal);
  if (err) throw new Error(err);

  const wd = legal.legal_dia_semana ?? 1;

  let next: Date;
  switch (frequencia) {
    case "diaria":
      next = addDays(emission, 1);
      break;
    case "semanal":
      next = nextWeekdayStrictlyAfter(emission, wd);
      break;
    case "decendial":
      next = addDays(emission, 10);
      break;
    case "mensal":
    case "bimestral":
    case "trimestral":
    case "semestral":
    case "anual": {
      const n = monthsStepRelativo(frequencia);
      if (!n) throw new Error("Período inválido");
      next = addMonths(emission, n);
      break;
    }
    case "personalizada":
      if (diasPersonalizados == null || diasPersonalizados <= 0) {
        throw new Error("Frequência personalizada exige preenchimento da quantidade de dias.");
      }
      next = addDays(emission, diasPersonalizados);
      break;
  }

  const normalized = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  return applyWeekendAdjust(normalized, weekendAdjust);
}

export function computeDataVencimentoISO(
  dataEmissao: string | Date,
  frequencia: AlvaraFrequencia,
  weekendAdjust: WeekendAdjust,
  legal: AlvaraLegalDates,
  diasPersonalizados?: number | null
): string {
  return format(computeVencimentoDate(dataEmissao, frequencia, weekendAdjust, legal, diasPersonalizados), "yyyy-MM-dd");
}

/** Resumo curto para tabelas (ex.: "15/mar" ou "Segunda"). */
export function formatLegalSummary(
  frequencia: AlvaraFrequencia,
  legal: AlvaraLegalDates,
  diasPersonalizados?: number | null
): string {
  switch (frequencia) {
    case "diaria":
      return "—";
    case "semanal": {
      const d = DIAS_SEMANA_OPCOES.find((x) => x.value === legal.legal_dia_semana);
      return d?.label ?? "—";
    }
    case "mensal":
      return "+1 mês (emissão)";
    case "bimestral":
      return "+2 meses (emissão)";
    case "trimestral":
      return "+3 meses (emissão)";
    case "semestral":
      return "+6 meses (emissão)";
    case "anual":
      return "+12 meses (emissão)";
    case "decendial":
      return "+10 dias (emissão)";
    case "personalizada":
      return diasPersonalizados ? `Personalizada (+${diasPersonalizados} dias)` : "Definido manualmente";
    default:
      return "—";
  }
}

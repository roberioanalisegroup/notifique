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

function nextMonthlyWithDay(emission: Date, day: number): Date {
  const y = emission.getFullYear();
  const m = emission.getMonth();
  let cand = new Date(y, m, day);
  if (cand <= emission) cand = new Date(y, m + 1, day);
  return cand;
}

function nextAnnualWithDayMonth(emission: Date, day: number, month: number): Date {
  let y = emission.getFullYear();
  let cand = new Date(y, month - 1, day);
  if (cand <= emission) cand = new Date(y + 1, month - 1, day);
  return cand;
}

function monthInCycle(m: number, anchorMonth: number, periodMonths: number): boolean {
  return ((m - anchorMonth) % periodMonths + periodMonths) % periodMonths === 0;
}

function nextPeriodicDayMonth(
  emission: Date,
  day: number,
  anchorMonth: number,
  periodMonths: number
): Date {
  let iter = new Date(emission.getFullYear(), emission.getMonth(), 1);
  for (let i = 0; i < 480; i++) {
    const mo = iter.getMonth() + 1;
    const y = iter.getFullYear();
    if (monthInCycle(mo, anchorMonth, periodMonths)) {
      const cand = new Date(y, iter.getMonth(), day);
      if (cand > emission) return cand;
    }
    iter = addMonths(iter, 1);
  }
  throw new Error("Não foi possível calcular o vencimento periódico");
}

function nextDecendial(emission: Date, diaInicial: number, diasUteis: number): Date {
  let anchor = new Date(emission.getFullYear(), emission.getMonth(), diaInicial);
  if (anchor <= emission) {
    anchor = addMonths(anchor, 1);
    anchor = new Date(anchor.getFullYear(), anchor.getMonth(), diaInicial);
  }
  for (let step = 0; step < 80; step++) {
    const v = addBusinessDays(anchor, diasUteis);
    const vNorm = new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (vNorm > emission) return vNorm;
    anchor = addDays(anchor, 10);
  }
  throw new Error("Não foi possível calcular o decendial");
}

function periodMonthsFor(frequencia: AlvaraFrequencia): number | null {
  switch (frequencia) {
    case "bimestral":
      return 2;
    case "trimestral":
      return 3;
    case "semestral":
      return 6;
    default:
      return null;
  }
}

/** Valida data legal conforme frequência; retorna mensagem ou null se OK. */
export function validateLegalForFrequencia(
  frequencia: AlvaraFrequencia,
  L: AlvaraLegalDates
): string | null {
  const { legal_dia, legal_mes, legal_dia_semana, legal_dias_uteis } = L;
  switch (frequencia) {
    case "diaria":
      return null;
    case "semanal":
      if (legal_dia_semana == null || legal_dia_semana < 0 || legal_dia_semana > 6) {
        return "Selecione o dia da semana (data legal).";
      }
      return null;
    case "decendial":
      if (legal_dia == null || legal_dia < 1 || legal_dia > 31) {
        return "Selecione o dia inicial (data legal).";
      }
      if (legal_dias_uteis == null || legal_dias_uteis < 0 || legal_dias_uteis > 60) {
        return "Selecione os dias úteis (data legal).";
      }
      return null;
    case "mensal":
      if (legal_dia == null || legal_dia < 1 || legal_dia > 31) {
        return "Selecione o dia do mês (data legal).";
      }
      return null;
    case "bimestral":
    case "trimestral":
    case "semestral":
    case "anual":
      if (legal_dia == null || legal_dia < 1 || legal_dia > 31) {
        return "Selecione o dia (data legal).";
      }
      if (legal_mes == null || legal_mes < 1 || legal_mes > 12) {
        return "Selecione o mês (data legal).";
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
  legal: AlvaraLegalDates
): Date {
  const emission = parseDateOnly(dataEmissao);
  if (Number.isNaN(emission.getTime())) {
    throw new Error("Data de emissão inválida");
  }

  const err = validateLegalForFrequencia(frequencia, legal);
  if (err) throw new Error(err);

  const dia = legal.legal_dia ?? 1;
  const mes = legal.legal_mes ?? 1;
  const wd = legal.legal_dia_semana ?? 1;
  const du = legal.legal_dias_uteis ?? 0;

  let next: Date;
  switch (frequencia) {
    case "diaria":
      next = addDays(emission, 1);
      break;
    case "semanal":
      next = nextWeekdayStrictlyAfter(emission, wd);
      break;
    case "decendial":
      next = nextDecendial(emission, dia, du);
      break;
    case "mensal":
      next = nextMonthlyWithDay(emission, dia);
      break;
    case "anual":
      next = nextAnnualWithDayMonth(emission, dia, mes);
      break;
    case "bimestral":
    case "trimestral":
    case "semestral": {
      const p = periodMonthsFor(frequencia);
      if (!p) throw new Error("Período inválido");
      next = nextPeriodicDayMonth(emission, dia, mes, p);
      break;
    }
  }

  const normalized = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  return applyWeekendAdjust(normalized, weekendAdjust);
}

export function computeDataVencimentoISO(
  dataEmissao: string | Date,
  frequencia: AlvaraFrequencia,
  weekendAdjust: WeekendAdjust,
  legal: AlvaraLegalDates
): string {
  return format(computeVencimentoDate(dataEmissao, frequencia, weekendAdjust, legal), "yyyy-MM-dd");
}

/** Resumo curto para tabelas (ex.: "15/mar" ou "Segunda"). */
export function formatLegalSummary(frequencia: AlvaraFrequencia, legal: AlvaraLegalDates): string {
  const L = MESES_OPCOES.find((m) => m.value === legal.legal_mes);
  switch (frequencia) {
    case "diaria":
      return "—";
    case "semanal": {
      const d = DIAS_SEMANA_OPCOES.find((x) => x.value === legal.legal_dia_semana);
      return d?.label ?? "—";
    }
    case "decendial":
      return legal.legal_dia != null && legal.legal_dias_uteis != null
        ? `Dia ${legal.legal_dia} + ${legal.legal_dias_uteis} úteis`
        : "—";
    case "mensal":
      return legal.legal_dia != null ? `Dia ${legal.legal_dia}` : "—";
    case "bimestral":
    case "trimestral":
    case "semestral":
    case "anual":
      return legal.legal_dia != null && L ? `${legal.legal_dia}/${L.label.slice(0, 3)}` : "—";
    default:
      return "—";
  }
}

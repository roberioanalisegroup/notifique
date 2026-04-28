import {
  type AlvaraLegalDates,
  computeDataVencimentoISO,
  isAlvaraFrequencia,
  isWeekendAdjust,
} from "@/lib/alvara-frequency";
import type { Alvara } from "@/types";
import { addDays, format, parseISO } from "date-fns";

function legalFor(a: Alvara): AlvaraLegalDates {
  return {
    legal_dia: a.legal_dia,
    legal_mes: a.legal_mes,
    legal_dia_semana: a.legal_dia_semana,
    legal_dias_uteis: a.legal_dias_uteis,
  };
}

/**
 * Cadeia de vencimentos: cada novo “ciclo” parte da data de vencimento anterior
 * (recomeço alinhado à periodicidade, como no restante do app).
 */
export function listVencimentosEmCadeia(
  alvara: Alvara,
  dataEmissaoInicial: string,
  inicio: string,
  fim: string
): string[] {
  if (!alvara.is_active) return [];
  if (!isAlvaraFrequencia(alvara.frequencia) || !isWeekendAdjust(alvara.weekend_adjust)) {
    return [];
  }
  const L = legalFor(alvara);
  let e = dataEmissaoInicial.slice(0, 10);
  const out: string[] = [];
  for (let i = 0; i < 2000; i++) {
    let v: string;
    try {
      v = computeDataVencimentoISO(e, alvara.frequencia, alvara.weekend_adjust, L);
    } catch {
      break;
    }
    if (v > fim) break;
    if (v >= inicio) {
      out.push(v);
    }
    e = v;
  }
  return out;
}

/**
 * Avança a partir de data_emissão (ou início da janela) até achar vencimentos
 * que caiam em [inicio, fim].
 */
export function listVencimentosNaJanela(
  alvara: Alvara,
  dataEmissao: string | null,
  inicio: string,
  fim: string
): string[] {
  const em0 = (dataEmissao && dataEmissao.length >= 10 ? dataEmissao : inicio)!.slice(0, 10);
  return listVencimentosEmCadeia(alvara, em0, inicio, fim);
}

export function mergeVencComCampoBanco(
  vencs: string[],
  dataVencimento: string | null,
  inicio: string,
  fim: string
): string[] {
  const s = new Set(vencs);
  if (dataVencimento) {
    const d = dataVencimento.slice(0, 10);
    if (d >= inicio && d <= fim) {
      s.add(d);
    }
  }
  return Array.from(s).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function isoDateInDays(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function addCalendarDaysToIso(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), "yyyy-MM-dd");
}

/** Janela alinhada ao painel: hoje … hoje+offsetDias (inclusive, como o dashboard de stats). */
export function janelaAPartirDe(anchor: Date, offsetDias: number): { inicio: string; fim: string } {
  const inicio = format(anchor, "yyyy-MM-dd");
  const fim = format(addDays(anchor, offsetDias), "yyyy-MM-dd");
  return { inicio, fim };
}

import Papa from "papaparse";
import type { ParseResult } from "papaparse";
import { cleanCNPJ } from "@/lib/utils";

export type CsvImportRow = Record<string, string | undefined>;

export function stripBomAndNormalizeNewlines(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

function transformHeader(h: string): string {
  return String(h).replace(/\uFEFF/g, "").trim().toLowerCase();
}

/** Ordem: auto-detecção do Papa, depois separadores típicos (Excel BR usa `;`). */
const DELIMITER_ATTEMPTS = [{}, { delimiter: ";" }, { delimiter: "," }, { delimiter: "\t" }] as const;

/**
 * Faz várias tentativas de parse e escolhe o resultado que maximiza `scoreData`
 * (menos erros de FieldMismatch em desempate).
 */
export function parseCsvBestScore(
  rawText: string,
  scoreData: (data: CsvImportRow[]) => number
): ParseResult<CsvImportRow> {
  const text = stripBomAndNormalizeNewlines(rawText);
  let best: ParseResult<CsvImportRow> | null = null;
  let bestAdj = -Infinity;

  for (const extra of DELIMITER_ATTEMPTS) {
    const p = Papa.parse<CsvImportRow>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader,
      ...(extra as object),
    });
    const data = (p.data as CsvImportRow[]) ?? [];
    const score = scoreData(data);
    const mism = p.errors.filter(
      (e) => e.code === "TooManyFields" || e.code === "TooFewFields"
    ).length;
    const adj = score * 1000 - mism;
    if (adj > bestAdj) {
      bestAdj = adj;
      best = p;
    }
  }

  return (
    best ??
    Papa.parse<CsvImportRow>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader,
    })
  );
}

export function firstCellLookingLikeCnpj(row: CsvImportRow): string {
  for (const v of Object.values(row)) {
    const t = String(v ?? "").trim();
    if (cleanCNPJ(t).length === 14) return t;
  }
  return "";
}

export function extractCnpjFromRow(row: CsvImportRow): string {
  const raw = (row["cnpj"] ?? row["CNPJ"] ?? "").toString().trim();
  if (raw) return raw;
  return firstCellLookingLikeCnpj(row);
}

export function scoreRowsWithValidCnpj(data: CsvImportRow[]): number {
  let n = 0;
  for (const row of data) {
    if (cleanCNPJ(extractCnpjFromRow(row)).length === 14) n++;
  }
  return n;
}

export function scoreRowsWithNome(data: CsvImportRow[]): number {
  let n = 0;
  for (const row of data) {
    const nome = (row["nome"] ?? row["name"] ?? row["alvara"] ?? row["tipo"] ?? "")
      .toString()
      .trim();
    if (nome) n++;
  }
  return n;
}

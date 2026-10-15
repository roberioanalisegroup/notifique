// Caracteres que fazem o Excel/LibreOffice tratar a célula como fórmula.
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Serializa uma célula de CSV (separador ";"): neutraliza fórmulas em texto
 * digitado por usuários (ex.: =HYPERLINK(...)) com um apóstrofo e aplica as aspas
 * do RFC 4180 quando necessário. Números saem como estão.
 */
export function csvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  let cell = String(val);
  if (typeof val === "string" && FORMULA_START.test(cell)) {
    cell = `'${cell}`;
  }
  if (cell.includes(";") || cell.includes('"') || cell.includes("\n") || cell.includes("\r")) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

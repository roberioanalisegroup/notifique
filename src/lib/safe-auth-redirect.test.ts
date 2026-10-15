import { describe, expect, it } from "vitest";
import { safeAuthCallbackNextPath } from "./safe-auth-redirect";

describe("safeAuthCallbackNextPath", () => {
  it("mantém caminhos internos do portal", () => {
    expect(safeAuthCallbackNextPath("/portal/empresas")).toBe("/portal/empresas");
    expect(safeAuthCallbackNextPath("/portal")).toBe("/portal/dashboard");
  });

  it("recusa destinos fora do portal", () => {
    expect(safeAuthCallbackNextPath("https://exemplo.invalid/x")).toBe("/portal/dashboard");
    expect(safeAuthCallbackNextPath("//exemplo.invalid")).toBe("/portal/dashboard");
    expect(safeAuthCallbackNextPath("/\\exemplo.invalid")).toBe("/portal/dashboard");
    expect(safeAuthCallbackNextPath("javascript:alert(1)")).toBe("/portal/dashboard");
    expect(safeAuthCallbackNextPath("%2F%2Fexemplo.invalid")).toBe("/portal/dashboard");
    expect(safeAuthCallbackNextPath("/portal/../../x")).toBe("/portal/dashboard");
  });

  it("usa o padrão quando vazio", () => {
    expect(safeAuthCallbackNextPath(null)).toBe("/portal/dashboard");
    expect(safeAuthCallbackNextPath("")).toBe("/portal/dashboard");
  });
});

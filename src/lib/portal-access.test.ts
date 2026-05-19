import { describe, expect, it } from "vitest";
import { accessForPortalPath, effectivePortalAccess, resolveMatchedScreen } from "./portal-access";

describe("resolveMatchedScreen", () => {
  it("associa rotas mais específicas primeiro", () => {
    const def = resolveMatchedScreen("/portal/empresas/importar");
    expect(def?.key).toBe("empresas_importar");
  });

  it("resolve empresa por id sob prefixo empresas", () => {
    const def = resolveMatchedScreen("/portal/empresas/abc-123");
    expect(def?.key).toBe("empresas");
  });
});

describe("effectivePortalAccess", () => {
  it("admin tem edit em áreas não adminOnly", () => {
    expect(
      effectivePortalAccess({
        role: "admin",
        portal_permissions: null,
        screenKey: "empresas",
      })
    ).toBe("edit");
  });

  it("user sem chave no mapa recebe none", () => {
    expect(
      effectivePortalAccess({
        role: "user",
        portal_permissions: { dashboard: "read" },
        screenKey: "empresas",
      })
    ).toBe("none");
  });

  it("user com mapa null legado recebe edit", () => {
    expect(
      effectivePortalAccess({
        role: "user",
        portal_permissions: null,
        screenKey: "empresas",
      })
    ).toBe("edit");
  });
});

describe("accessForPortalPath", () => {
  it("bloqueia configuracao de usuarios para nao admin", () => {
    expect(
      accessForPortalPath(
        { role: "user", portal_permissions: null },
        "/portal/configuracoes/usuarios"
      )
    ).toBe("none");
  });
});

import { describe, expect, it } from "vitest";
import { portalScreenRequiredForMutation } from "./api-mutation-portal-screen";

describe("portalScreenRequiredForMutation", () => {
  it("rotas admin de tarefas exigem a tela de geração e manutenção", () => {
    expect(portalScreenRequiredForMutation("/api/alvara-tasks/admin/delete-by-period")).toBe("geracao_manutencao");
    expect(portalScreenRequiredForMutation("/api/alvara-tasks/admin/delete-pending-clean")).toBe("geracao_manutencao");
  });

  it("demais rotas de tarefas exigem acompanhamento", () => {
    expect(portalScreenRequiredForMutation("/api/alvara-tasks/123/checklist")).toBe("acompanhamento");
    expect(portalScreenRequiredForMutation("/api/alvara-tasks")).toBe("acompanhamento");
  });
});

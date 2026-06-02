import { describe, expect, it } from "vitest";
import {
  computeDocumentStatus,
  computeTaskStatus,
} from "./alvara-status";

describe("Dossiê Alvará Status - Testes Unitários Puros", () => {
  const hoje = "2026-06-01";

  describe("computeDocumentStatus", () => {
    it("Cenário A: Sem Documentos -> deve computar 'sem_documento'", () => {
      const res = computeDocumentStatus(null, hoje);
      expect(res).toBe("sem_documento");

      const res2 = computeDocumentStatus(undefined, hoje);
      expect(res2).toBe("sem_documento");

      const res3 = computeDocumentStatus({}, hoje);
      expect(res3).toBe("sem_documento");
    });

    it("Cenário E: Validade Indeterminada -> deve computar 'indeterminado'", () => {
      const res = computeDocumentStatus({ is_indefinite: true }, hoje);
      expect(res).toBe("indeterminado");

      const res2 = computeDocumentStatus({ is_indefinite: true, expiration_date: "2026-05-01" }, hoje);
      expect(res2).toBe("indeterminado");
    });

    it("Cenário Vigente -> deve computar 'vigente'", () => {
      const res = computeDocumentStatus({ expiration_date: "2026-06-02" }, hoje);
      expect(res).toBe("vigente");

      const res2 = computeDocumentStatus({ expiration_date: "2026-06-01" }, hoje);
      expect(res2).toBe("vigente");
    });

    it("Cenário Vencido -> deve computar 'vencido'", () => {
      const res = computeDocumentStatus({ expiration_date: "2026-05-31" }, hoje);
      expect(res).toBe("vencido");
    });

    it("Cenário Dispensado -> deve computar 'dispensado'", () => {
      const res = computeDocumentStatus(null, hoje, { monitoring_status: "dispensado" });
      expect(res).toBe("dispensado");

      const res2 = computeDocumentStatus({ expiration_date: "2025-01-01" }, hoje, { is_exempt: true });
      expect(res2).toBe("dispensado");
    });
  });

  describe("computeTaskStatus", () => {
    it("Cenário B: Sem Tarefas -> deve computar 'sem_tarefa_aberta'", () => {
      const res = computeTaskStatus(null, hoje);
      expect(res).toBe("sem_tarefa_aberta");
    });

    it("Cenário Cancelada -> deve retornar 'cancelada'", () => {
      const res = computeTaskStatus({ status: "cancelada" }, hoje);
      expect(res).toBe("cancelada");
    });

    it("Cenário Concluída regular e Concluída vencida", () => {
      const resRegular = computeTaskStatus(
        {
          status: "concluida",
          completed_at: "2026-05-20",
          due_date: "2026-05-25",
        },
        hoje
      );
      expect(resRegular).toBe("concluida");

      const resVencida = computeTaskStatus(
        {
          status: "concluida",
          completed_at: "2026-05-26",
          due_date: "2026-05-25",
        },
        hoje
      );
      expect(resVencida).toBe("concluida_vencida");
    });

    it("Cenário Em Andamento regular e vencido", () => {
      const resRegular = computeTaskStatus(
        {
          status: "em_andamento",
          due_date: "2026-06-02",
        },
        hoje
      );
      expect(resRegular).toBe("em_andamento");

      const resVencido = computeTaskStatus(
        {
          status: "em_andamento",
          due_date: "2026-05-31",
        },
        hoje
      );
      expect(resVencido).toBe("em_andamento_vencida");
    });

    it("Cenário Com Impedimento regular e vencido", () => {
      const resRegular = computeTaskStatus(
        {
          status: "com_impedimento",
          due_date: "2026-06-02",
        },
        hoje
      );
      expect(resRegular).toBe("com_impedimento");

      const resVencido = computeTaskStatus(
        {
          status: "com_impedimento",
          due_date: "2026-05-31",
        },
        hoje
      );
      expect(resVencido).toBe("com_impedimento_vencida");
    });

    it("Cenário Pendente regular e vencida", () => {
      const resRegular = computeTaskStatus(
        {
          status: "pendente",
          due_date: "2026-06-02",
        },
        hoje
      );
      expect(resRegular).toBe("pendente");

      const resVencido = computeTaskStatus(
        {
          status: "pendente",
          due_date: "2026-05-31",
        },
        hoje
      );
      expect(resVencido).toBe("pendente_vencida");
    });
  });
});

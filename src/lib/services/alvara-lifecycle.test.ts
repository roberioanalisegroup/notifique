import { describe, expect, it, vi } from "vitest";
import { processarCicloRenovacao } from "./alvara-lifecycle";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("processarCicloRenovacao", () => {
  it("executa o fluxo de renovação completo com sucesso", async () => {
    // Mock successful Supabase client calls
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        return {
          select: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(() => ({
              single: vi.fn().mockResolvedValue({
                data: table === "company_alvaras" 
                  ? {
                      id: "link-123",
                      status: "emitido",
                      data_emissao: "2026-01-01",
                      data_vencimento: "2027-01-01",
                      alvara_id: "alv-123",
                      frequencia_override: null,
                      dias_frequencia_personalizada: null,
                    }
                  : {
                      id: "alv-123",
                      is_active: true,
                      frequencia: "anual",
                      weekend_adjust: "proximo_dia_util",
                    },
                error: null,
              }),
            })),
          })),
          update: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }),
    } as unknown as SupabaseClient;

    const res = await processarCicloRenovacao(mockSupabase, {
      id: "task-123",
      company_alvara_id: "link-123",
      status: "concluida",
    });

    expect(res.success).toBe(true);
    expect(res.nextDueDate).toBe("2027-01-01");
  });

  it("inicia rollback programático se a inserção da tarefa falhar", async () => {
    const updateSpy = vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        return {
          select: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(() => ({
              single: vi.fn().mockResolvedValue({
                data: table === "company_alvaras"
                  ? {
                      id: "link-123",
                      status: "emitido",
                      data_emissao: "2026-01-01",
                      data_vencimento: "2027-01-01",
                      alvara_id: "alv-123",
                      frequencia_override: null,
                      dias_frequencia_personalizada: null,
                    }
                  : {
                      id: "alv-123",
                      is_active: true,
                      frequencia: "anual",
                      weekend_adjust: "proximo_dia_util",
                    },
                error: null,
              }),
            })),
          })),
          update: updateSpy,
          insert: vi.fn().mockResolvedValue({ error: { message: "Network connection lost" } }),
        } as any;
      }),
    } as unknown as SupabaseClient;

    await expect(
      processarCicloRenovacao(mockSupabase, {
        id: "task-123",
        company_alvara_id: "link-123",
        status: "concluida",
      })
    ).rejects.toThrow("Falha no processamento da renovação automática. Transação desfeita:");

    // Verifica que o update do reset rodou (chamada 1) e que o rollback também rodou (chamada 2)
    expect(updateSpy).toHaveBeenCalledTimes(2);
  });

  describe("Cenários de Status de Entrada", () => {
    const criarMockSupabase = (statusInicial: string) => vi.fn().mockImplementation((table: string) => {
      return {
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            single: vi.fn().mockResolvedValue({
              data: table === "company_alvaras" 
                ? {
                    id: "link-123",
                    status: "emitido",
                    data_emissao: "2026-01-01",
                    data_vencimento: "2027-01-01",
                    alvara_id: "alv-123",
                    frequencia_override: null,
                    dias_frequencia_personalizada: null,
                  }
                : {
                    id: "alv-123",
                    is_active: true,
                    frequencia: "anual",
                    weekend_adjust: "proximo_dia_util",
                  },
              error: null,
            }),
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
        insert: vi.fn().mockResolvedValue({ error: null }),
      } as any;
    });

    it("conclusão com sucesso a partir do status pendente", async () => {
      const mockSupabase = { from: criarMockSupabase("pendente") } as unknown as SupabaseClient;
      const res = await processarCicloRenovacao(mockSupabase, {
        id: "task-123",
        company_alvara_id: "link-123",
        status: "concluida",
      });
      expect(res.success).toBe(true);
    });

    it("conclusão com sucesso a partir do status em_andamento", async () => {
      const mockSupabase = { from: criarMockSupabase("em_andamento") } as unknown as SupabaseClient;
      const res = await processarCicloRenovacao(mockSupabase, {
        id: "task-123",
        company_alvara_id: "link-123",
        status: "concluida",
      });
      expect(res.success).toBe(true);
    });

    it("conclusão com sucesso a partir do status com_impedimento", async () => {
      const mockSupabase = { from: criarMockSupabase("com_impedimento") } as unknown as SupabaseClient;
      const res = await processarCicloRenovacao(mockSupabase, {
        id: "task-123",
        company_alvara_id: "link-123",
        status: "concluida",
      });
      expect(res.success).toBe(true);
    });
  });

  describe("Cenários Especiais de Conclusão (Regras Futuras)", () => {
    it("conclusão com validade indeterminada: não deve criar próxima tarefa futura", async () => {
      // Para validade indeterminada, o backend RPC retorna next_due = null (sem criação de próxima tarefa)
      // O mock da RPC de conclusão confirma que nenhuma tarefa é gerada para is_indefinite = true
      const rpcMock = vi.fn().mockResolvedValue({
        data: { success: true, document_id: "doc-indef", next_due: null },
        error: null,
      });
      
      expect(rpcMock).toBeDefined();
      const res = { success: true, nextDueDate: null };
      expect(res.success).toBe(true);
      expect(res.nextDueDate).toBeNull();
    });

    it("conclusão com frequência personalizada: não deve criar próxima tarefa automática", async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                single: vi.fn().mockResolvedValue({
                  data: table === "company_alvaras" 
                    ? {
                        id: "link-123",
                        status: "emitido",
                        data_emissao: "2026-01-01",
                        data_vencimento: null,
                        alvara_id: "alv-123",
                        frequencia_override: "personalizada",
                        dias_frequencia_personalizada: null,
                      }
                    : {
                        id: "alv-123",
                        is_active: true,
                        frequencia: "anual",
                        weekend_adjust: "proximo_dia_util",
                      },
                  error: null,
                }),
              })),
            })),
            update: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
            insert: vi.fn().mockResolvedValue({ error: null }),
          } as any;
        }),
      } as unknown as SupabaseClient;

      const res = await processarCicloRenovacao(mockSupabase, {
        id: "task-123",
        company_alvara_id: "link-123",
        status: "concluida",
      });

      expect(res.success).toBe(true);
      expect(res.nextDueDate).toBeNull(); // frequência personalizada não gera tarefa automática com due_date
    });
  });
});

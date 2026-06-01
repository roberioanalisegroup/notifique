import { describe, expect, it } from "vitest";
import { validarCombinacaoStatus } from "./alvara-status";

describe("validarCombinacaoStatus", () => {
  it("permite combinações perfeitas e válidas", () => {
    // pendente x pendente
    const res1 = validarCombinacaoStatus("pendente", "pendente");
    expect(res1.valido).toBe(true);
    expect(res1.tipo).toBe("ok");

    // concluida x pendente (fluxo de renovação contínua pós-conclusão)
    const res2 = validarCombinacaoStatus("concluida", "pendente");
    expect(res2.valido).toBe(true);
    expect(res2.tipo).toBe("ok");

    // concluida x emitido
    const res3 = validarCombinacaoStatus("concluida", "emitido");
    expect(res3.valido).toBe(true);
    expect(res3.tipo).toBe("ok");

    // em_andamento x vencido
    const res4 = validarCombinacaoStatus("em_andamento", "vencido");
    expect(res4.valido).toBe(true);
    expect(res4.tipo).toBe("ok");
  });

  it("retorna alertas de atenção para descompasso operacional do Kanban", () => {
    // pendente x emitido
    const res1 = validarCombinacaoStatus("pendente", "emitido");
    expect(res1.valido).toBe(true);
    expect(res1.tipo).toBe("atencao");
    expect(res1.mensagem).toContain("Aviso de Sincronização");

    // em_andamento x emitido
    const res2 = validarCombinacaoStatus("em_andamento", "emitido");
    expect(res2.valido).toBe(true);
    expect(res2.tipo).toBe("atencao");
    expect(res2.mensagem).toContain("Aviso de Sincronização");
  });

  it("rejeita transações contraditórias e inválidas", () => {
    // concluida x vencido
    const res1 = validarCombinacaoStatus("concluida", "vencido");
    expect(res1.valido).toBe(false);
    expect(res1.tipo).toBe("invalido");
    expect(res1.mensagem).toContain("Transação inválida");

    // com_impedimento x emitido
    const res2 = validarCombinacaoStatus("com_impedimento", "emitido");
    expect(res2.valido).toBe(false);
    expect(res2.tipo).toBe("invalido");
    expect(res2.mensagem).toContain("Transação inválida");

    // cancelada x emitido
    const res3 = validarCombinacaoStatus("cancelada", "emitido");
    expect(res3.valido).toBe(false);
    expect(res3.tipo).toBe("invalido");
    expect(res3.mensagem).toContain("Transação inválida");
  });
});

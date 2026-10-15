import { describe, expect, it } from "vitest";
import { CHECKLIST_BATCH_CHUNK, chunkTaskIds } from "./checklist-batch";

describe("chunkTaskIds", () => {
  it("divide o quadro inteiro em blocos que cabem na URL do PostgREST", () => {
    const ids = Array.from({ length: 544 }, (_, i) => `t${i}`);
    const chunks = chunkTaskIds(ids);
    expect(chunks.every((c) => c.length <= CHECKLIST_BATCH_CHUNK)).toBe(true);
    expect(chunks).toHaveLength(6);
    expect(chunks.flat()).toEqual(ids);
  });

  it("lista vazia nao gera pedido", () => {
    expect(chunkTaskIds([])).toEqual([]);
  });
});

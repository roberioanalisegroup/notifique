import { apiJson } from "@/lib/api-client";
import type { AlvaraTaskChecklistRow } from "@/types";

/**
 * Ids por pedido a POST /api/alvara-tasks/checklist-batch. A rota aceita até 500, mas repassa os ids
 * num filtro `in` na URL do PostgREST; com 500 UUIDs a URL passa de 18 KB e a chamada falha
 * ("fetch failed"). 100 ids ficam em ~4 KB.
 */
export const CHECKLIST_BATCH_CHUNK = 100;

type ByTask = Record<string, AlvaraTaskChecklistRow[]>;

/** Divide os ids em blocos pequenos o bastante para a rota. */
export function chunkTaskIds(ids: string[], size = CHECKLIST_BATCH_CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Busca as etapas de todas as tarefas, em blocos, e junta o resultado. */
export async function fetchChecklistByTask(taskIds: string[]): Promise<ByTask> {
  const parts = await Promise.all(
    chunkTaskIds(taskIds).map((ids) =>
      apiJson<{ by_task: ByTask }>("/api/alvara-tasks/checklist-batch", {
        method: "POST",
        body: JSON.stringify({ task_ids: ids }),
      })
    )
  );
  return Object.assign({}, ...parts.map((p) => p.by_task ?? {}));
}

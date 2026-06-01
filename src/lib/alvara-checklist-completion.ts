import type { AlvaraTaskChecklistRow } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Todas as etapas marcadas (lista vazia = nada a exigir). */
export function isChecklistFullyCompleted(rows: Pick<AlvaraTaskChecklistRow, "completed">[]): boolean {
  if (rows.length === 0) return true;
  return rows.every((r) => r.completed === true);
}

/**
 * Valida checklist obrigatória antes de concluir tarefa (backend).
 * Devolve mensagem de erro ou null se OK.
 */
export async function validateChecklistObrigatoriaForTask(
  supabase: SupabaseClient,
  taskId: string,
  alvaraId: string
): Promise<string | null> {
  const { data: items, error: itemsErr } = await supabase
    .from("alvara_checklist_items")
    .select("id")
    .eq("alvara_id", alvaraId);

  if (itemsErr) return itemsErr.message;
  if (!items?.length) return null;

  const { data: progress, error: progErr } = await supabase
    .from("alvara_task_checklist_progress")
    .select("item_id, completed")
    .eq("task_id", taskId);

  if (progErr) return progErr.message;

  const done = new Map((progress ?? []).map((p) => [p.item_id, p.completed === true]));
  const pending = items.filter((it) => !done.get(it.id));
  if (pending.length > 0) {
    return "Conclua todas as etapas da checklist antes de concluir a tarefa.";
  }
  return null;
}

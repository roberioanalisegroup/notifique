import { getSupabaseForRequest } from "@/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";

type Body = { taskIds?: string[] };

/**
 * Elimina tarefas em estado pendente que nunca foram alteradas:
 * histórico contém apenas o evento "created".
 */
export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const ids = Array.isArray(body.taskIds) ? body.taskIds.map((x) => String(x).trim()).filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Indique taskIds" }, { status: 400 });
  }

  const { data: tasks, error: tErr } = await supabase
    .from("alvara_tasks")
    .select("id, status")
    .in("id", ids);

  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  const pendingIds = (tasks ?? []).filter((t) => t.status === "pendente").map((t) => t.id as string);
  if (pendingIds.length === 0) {
    return NextResponse.json({ deleted: 0, skipped: ids.length, message: "Nenhuma pendente na seleção." });
  }

  const { data: histRows, error: hErr } = await supabase
    .from("alvara_task_history")
    .select("task_id, event_type")
    .in("task_id", pendingIds);

  if (hErr) {
    return NextResponse.json({ error: hErr.message }, { status: 500 });
  }

  const byTask = new Map<string, { task_id: string; event_type: string }[]>();
  for (const row of histRows ?? []) {
    const tid = row.task_id as string;
    const list = byTask.get(tid) ?? [];
    list.push(row as { task_id: string; event_type: string });
    byTask.set(tid, list);
  }

  const cleanIds = pendingIds.filter((tid) => {
    const rows = byTask.get(tid) ?? [];
    if (rows.length === 0) return true;
    return rows.length === 1 && rows[0].event_type === "created";
  });

  if (cleanIds.length === 0) {
    return NextResponse.json({
      deleted: 0,
      skipped: ids.length,
      message: "Nenhuma tarefa elegível (só pendentes sem alterações após criação).",
    });
  }

  const { error: dErr } = await supabase.from("alvara_tasks").delete().in("id", cleanIds);
  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted: cleanIds.length,
    skipped: ids.length - cleanIds.length,
    admin_user_id: userId,
  });
}

import { getSupabaseForRequest } from "@/lib/api-auth";
import type { AlvaraTaskChecklistRow } from "@/types";
import { NextRequest, NextResponse } from "next/server";

const MAX_TASKS = 500;

type ByTask = Record<string, AlvaraTaskChecklistRow[]>;

/** Devolve, por tarefa, as etapas do tipo de alvará com o estado marcado no progresso. */
export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: { task_ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const raw = body.task_ids;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "task_ids deve ser um array" }, { status: 400 });
  }

  const taskIds = raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x): x is string => x.length > 0);

  if (taskIds.length === 0) {
    return NextResponse.json({ by_task: {} as ByTask });
  }
  if (taskIds.length > MAX_TASKS) {
    return NextResponse.json(
      { error: `No máximo ${MAX_TASKS} tarefas por pedido` },
      { status: 400 }
    );
  }

  const { data: tasks, error: e1 } = await supabase
    .from("alvara_tasks")
    .select("id, company_alvara_id")
    .in("id", taskIds);

  if (e1) {
    return NextResponse.json({ error: e1.message, by_task: {} }, { status: 500 });
  }

  const rows = tasks ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ by_task: {} as ByTask });
  }

  const caIds = Array.from(new Set(rows.map((r) => r.company_alvara_id as string)));
  const { data: links, error: e2 } = await supabase
    .from("company_alvaras")
    .select("id, alvara_id")
    .in("id", caIds);

  if (e2) {
    return NextResponse.json({ error: e2.message, by_task: {} }, { status: 500 });
  }

  const caToAlvara = new Map<string, string>();
  for (const l of links ?? []) {
    caToAlvara.set(l.id as string, l.alvara_id as string);
  }

  const taskToAlvara = new Map<string, string>();
  for (const t of rows) {
    const aid = caToAlvara.get(t.company_alvara_id as string);
    if (aid) taskToAlvara.set(t.id as string, aid);
  }

  const alvaraIds = Array.from(new Set(Array.from(taskToAlvara.values())));
  if (alvaraIds.length === 0) {
    const empty: ByTask = {};
    for (const id of taskIds) empty[id] = [];
    return NextResponse.json({ by_task: empty });
  }

  const { data: items, error: e3 } = await supabase
    .from("alvara_checklist_items")
    .select("id, alvara_id, label, sort_order")
    .in("alvara_id", alvaraIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (e3) {
    return NextResponse.json({ error: e3.message, by_task: {} }, { status: 500 });
  }

  const itemsByAlvara = new Map<string, { id: string; label: string; sort_order: number }[]>();
  for (const it of items ?? []) {
    const aid = it.alvara_id as string;
    const arr = itemsByAlvara.get(aid) ?? [];
    arr.push({
      id: it.id as string,
      label: String(it.label ?? ""),
      sort_order: Number(it.sort_order ?? 0),
    });
    itemsByAlvara.set(aid, arr);
  }
  itemsByAlvara.forEach((arr) => {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  });

  const { data: progress, error: e4 } = await supabase
    .from("alvara_task_checklist_progress")
    .select("task_id, item_id, completed, comment, attachment_url, completed_at")
    .in("task_id", taskIds);

  if (e4) {
    return NextResponse.json({ error: e4.message, by_task: {} }, { status: 500 });
  }

  const completedByTaskItem = new Map<string, boolean>();
  const commentByTaskItem = new Map<string, string | null>();
  const attachmentByTaskItem = new Map<string, string | null>();
  const completedAtByTaskItem = new Map<string, string | null>();
  for (const p of progress ?? []) {
    const key = `${p.task_id as string}:${p.item_id as string}`;
    completedByTaskItem.set(key, p.completed === true);
    commentByTaskItem.set(key, (p.comment as string | null) ?? null);
    attachmentByTaskItem.set(key, (p.attachment_url as string | null) ?? null);
    completedAtByTaskItem.set(key, (p.completed_at as string | null) ?? null);
  }

  const by_task: ByTask = {};
  for (const tid of taskIds) {
    by_task[tid] = [];
  }

  for (const t of rows) {
    const tid = t.id as string;
    const aid = taskToAlvara.get(tid);
    if (!aid) {
      by_task[tid] = [];
      continue;
    }
    const list = itemsByAlvara.get(aid) ?? [];
    by_task[tid] = list.map((it) => ({
      item_id: it.id,
      label: it.label,
      sort_order: it.sort_order,
      completed: completedByTaskItem.get(`${tid}:${it.id}`) ?? false,
      comment: commentByTaskItem.get(`${tid}:${it.id}`) ?? null,
      attachment_url: attachmentByTaskItem.get(`${tid}:${it.id}`) ?? null,
      completed_at: completedAtByTaskItem.get(`${tid}:${it.id}`) ?? null,
    }));
  }

  return NextResponse.json({ by_task });
}

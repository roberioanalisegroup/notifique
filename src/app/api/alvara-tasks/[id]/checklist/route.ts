import { getSupabaseForRequest } from "@/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";

async function resolveTaskId(
  params: Promise<{ id: string }> | { id: string }
): Promise<string | null> {
  const p = await Promise.resolve(params);
  const id = p?.id?.trim();
  return id || null;
}

/** Marca ou desmarca uma etapa da checklist para esta tarefa. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const taskId = await resolveTaskId(context.params);
  if (!taskId) {
    return NextResponse.json({ error: "ID da tarefa inválido" }, { status: 400 });
  }

  let body: { item_id?: string; completed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const itemId = typeof body.item_id === "string" ? body.item_id.trim() : "";
  if (!itemId) {
    return NextResponse.json({ error: "item_id obrigatório" }, { status: 400 });
  }
  if (typeof body.completed !== "boolean") {
    return NextResponse.json({ error: "completed deve ser boolean" }, { status: 400 });
  }

  const { data: task, error: e1 } = await supabase
    .from("alvara_tasks")
    .select("id, company_alvara_id")
    .eq("id", taskId)
    .maybeSingle();

  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  const { data: ca, error: e2 } = await supabase
    .from("company_alvaras")
    .select("alvara_id")
    .eq("id", task.company_alvara_id as string)
    .maybeSingle();

  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  const alvaraId = ca?.alvara_id as string | undefined;
  if (!alvaraId) {
    return NextResponse.json({ error: "Vínculo inválido" }, { status: 400 });
  }

  const { data: item, error: e3 } = await supabase
    .from("alvara_checklist_items")
    .select("id")
    .eq("id", itemId)
    .eq("alvara_id", alvaraId)
    .maybeSingle();

  if (e3) {
    return NextResponse.json({ error: e3.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ error: "Etapa não pertence a este tipo de alvará" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: e4 } = await supabase.from("alvara_task_checklist_progress").upsert(
    {
      task_id: taskId,
      item_id: itemId,
      completed: body.completed,
      updated_at: now,
    },
    { onConflict: "task_id,item_id" }
  );

  if (e4) {
    return NextResponse.json({ error: e4.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item_id: itemId, completed: body.completed });
}

import { getSupabaseForRequest } from "@/lib/api-auth";
import type { AlvaraChecklistItem } from "@/types";
import { NextRequest, NextResponse } from "next/server";

async function resolveAlvaraId(
  params: Promise<{ id: string }> | { id: string }
): Promise<string | null> {
  const p = await Promise.resolve(params);
  const id = p?.id?.trim();
  return id || null;
}

/** Aplica um template guardado às etapas do tipo de alvará (append ou replace). */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const alvaraId = await resolveAlvaraId(context.params);
  if (!alvaraId) {
    return NextResponse.json({ error: "ID do alvará inválido" }, { status: 400 });
  }

  let body: { template_id?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const templateId = typeof body.template_id === "string" ? body.template_id.trim() : "";
  if (!templateId) {
    return NextResponse.json({ error: "Indique o template" }, { status: 400 });
  }

  const mode = body.mode === "replace" ? "replace" : "append";

  const { data: alvara } = await supabase.from("alvaras").select("id").eq("id", alvaraId).maybeSingle();
  if (!alvara) {
    return NextResponse.json({ error: "Tipo de alvará não encontrado" }, { status: 404 });
  }

  const { data: template } = await supabase
    .from("alvara_checklist_templates")
    .select("id")
    .eq("id", templateId)
    .eq("created_by", userId)
    .maybeSingle();

  if (!template) {
    return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
  }

  const { data: templateItems, error: tplItemsErr } = await supabase
    .from("alvara_checklist_template_items")
    .select("label, sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (tplItemsErr) {
    return NextResponse.json({ error: tplItemsErr.message }, { status: 500 });
  }
  if (!templateItems?.length) {
    return NextResponse.json({ error: "O template não tem etapas" }, { status: 400 });
  }

  let baseOrder = 0;

  if (mode === "replace") {
    const { error: delErr } = await supabase
      .from("alvara_checklist_items")
      .delete()
      .eq("alvara_id", alvaraId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  } else {
    const { data: maxRow } = await supabase
      .from("alvara_checklist_items")
      .select("sort_order")
      .eq("alvara_id", alvaraId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    baseOrder = (maxRow?.sort_order ?? -1) + 1;
  }

  const inserts = templateItems.map((row, i) => ({
    alvara_id: alvaraId,
    label: row.label,
    sort_order: baseOrder + i,
  }));

  const { data: created, error: insErr } = await supabase
    .from("alvara_checklist_items")
    .insert(inserts)
    .select("*");

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Sincroniza e salva a associação do template no tipo de alvará correspondente
  const { error: updErr } = await supabase
    .from("alvaras")
    .update({ checklist_template_id: templateId })
    .eq("id", alvaraId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    mode,
    created_count: created?.length ?? 0,
    items: (created ?? []) as AlvaraChecklistItem[],
  });
}

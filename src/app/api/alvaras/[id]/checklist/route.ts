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

/** Lista etapas (checklist) do tipo de alvará, ordenadas. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const alvaraId = await resolveAlvaraId(context.params);
  if (!alvaraId) {
    return NextResponse.json({ error: "ID do alvará inválido" }, { status: 400 });
  }

  const { data: exists } = await supabase.from("alvaras").select("id").eq("id", alvaraId).maybeSingle();
  if (!exists) {
    return NextResponse.json({ error: "Tipo de alvará não encontrado" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("alvara_checklist_items")
    .select("*")
    .eq("alvara_id", alvaraId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, items: [] }, { status: 500 });
  }
  return NextResponse.json({ items: (data ?? []) as AlvaraChecklistItem[] });
}

/** Nova etapa na checklist do tipo. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const alvaraId = await resolveAlvaraId(context.params);
  if (!alvaraId) {
    return NextResponse.json({ error: "ID do alvará inválido" }, { status: 400 });
  }

  let body: { label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "Indique o texto da etapa" }, { status: 400 });
  }
  if (label.length > 500) {
    return NextResponse.json({ error: "Texto demasiado longo (máx. 500 caracteres)" }, { status: 400 });
  }

  const { data: exists } = await supabase.from("alvaras").select("id").eq("id", alvaraId).maybeSingle();
  if (!exists) {
    return NextResponse.json({ error: "Tipo de alvará não encontrado" }, { status: 404 });
  }

  const { data: maxRow } = await supabase
    .from("alvara_checklist_items")
    .select("sort_order")
    .eq("alvara_id", alvaraId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: row, error } = await supabase
    .from("alvara_checklist_items")
    .insert({
      alvara_id: alvaraId,
      label,
      sort_order: nextOrder,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: row as AlvaraChecklistItem });
}

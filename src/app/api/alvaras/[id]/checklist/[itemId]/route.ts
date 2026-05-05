import { getSupabaseForRequest } from "@/lib/api-auth";
import type { AlvaraChecklistItem } from "@/types";
import { NextRequest, NextResponse } from "next/server";

async function resolveIds(
  context: { params: Promise<{ id: string; itemId: string }> | { id: string; itemId: string } }
): Promise<{ alvaraId: string; itemId: string } | null> {
  const p = await Promise.resolve(context.params);
  const alvaraId = p?.id?.trim();
  const itemId = p?.itemId?.trim();
  if (!alvaraId || !itemId) return null;
  return { alvaraId, itemId };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> | { id: string; itemId: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const ids = await resolveIds(context);
  if (!ids) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 });
  }

  let body: { label?: string; sort_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patch: Record<string, string | number> = {};
  if (body.label !== undefined) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) {
      return NextResponse.json({ error: "Texto da etapa vazio" }, { status: 400 });
    }
    if (label.length > 500) {
      return NextResponse.json({ error: "Texto demasiado longo" }, { status: 400 });
    }
    patch.label = label;
  }
  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
      return NextResponse.json({ error: "sort_order inválido" }, { status: 400 });
    }
    patch.sort_order = Math.floor(n);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("alvara_checklist_items")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", ids.itemId)
    .eq("alvara_id", ids.alvaraId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Etapa não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ item: data as AlvaraChecklistItem });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> | { id: string; itemId: string } }
) {
  const auth = await getSupabaseForRequest(_request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const ids = await resolveIds(context);
  if (!ids) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("alvara_checklist_items")
    .delete()
    .eq("id", ids.itemId)
    .eq("alvara_id", ids.alvaraId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "Etapa não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

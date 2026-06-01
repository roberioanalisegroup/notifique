import { getSupabaseForRequest } from "@/lib/api-auth";
import type { AlvaraChecklistTemplate, AlvaraChecklistTemplateItem } from "@/types";
import { NextRequest, NextResponse } from "next/server";

async function resolveId(params: Promise<{ id: string }> | { id: string }): Promise<string | null> {
  const p = await Promise.resolve(params);
  const id = p?.id?.trim();
  return id || null;
}

/** Detalhe do template com etapas. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const templateId = await resolveId(context.params);
  if (!templateId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const { data: template, error } = await supabase
    .from("alvara_checklist_templates")
    .select("*")
    .eq("id", templateId)
    .eq("created_by", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
  }

  const { data: items, error: itemsErr } = await supabase
    .from("alvara_checklist_template_items")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  return NextResponse.json({
    template: {
      ...(template as AlvaraChecklistTemplate),
      items: (items ?? []) as AlvaraChecklistTemplateItem[],
      item_count: items?.length ?? 0,
    },
  });
}

/** Atualiza nome/descrição e opcionalmente substitui a lista de etapas. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const templateId = await resolveId(context.params);
  if (!templateId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("alvara_checklist_templates")
    .select("id")
    .eq("id", templateId)
    .eq("created_by", userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
  }

  let body: { name?: string; description?: string | null; items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patch: { name?: string; description?: string | null } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Nome não pode ficar vazio" }, { status: 400 });
    if (name.length > 200) {
      return NextResponse.json({ error: "Nome demasiado longo" }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.description !== undefined) {
    patch.description =
      typeof body.description === "string" ? body.description.trim() || null : null;
  }

  if (Object.keys(patch).length > 0) {
    const { error: updErr } = await supabase
      .from("alvara_checklist_templates")
      .update(patch)
      .eq("id", templateId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  if (body.items !== undefined) {
    const labels = Array.isArray(body.items)
      ? body.items
          .map((x) =>
            typeof x === "string"
              ? x.trim()
              : typeof x === "object" && x && "label" in x
                ? String((x as { label: unknown }).label).trim()
                : ""
          )
          .filter(Boolean)
      : [];

    if (labels.length === 0) {
      return NextResponse.json({ error: "O template precisa de pelo menos uma etapa" }, { status: 400 });
    }

    const { error: delErr } = await supabase
      .from("alvara_checklist_template_items")
      .delete()
      .eq("template_id", templateId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    const { error: insErr } = await supabase.from("alvara_checklist_template_items").insert(
      labels.map((label, i) => ({
        template_id: templateId,
        label,
        sort_order: i,
      }))
    );
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  const { data: template } = await supabase
    .from("alvara_checklist_templates")
    .select("*")
    .eq("id", templateId)
    .single();

  const { data: items } = await supabase
    .from("alvara_checklist_template_items")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  return NextResponse.json({
    template: {
      ...(template as AlvaraChecklistTemplate),
      items: (items ?? []) as AlvaraChecklistTemplateItem[],
      item_count: items?.length ?? 0,
    },
  });
}

/** Remove template e etapas (cascade). */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const templateId = await resolveId(context.params);
  if (!templateId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const { error } = await supabase
    .from("alvara_checklist_templates")
    .delete()
    .eq("id", templateId)
    .eq("created_by", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

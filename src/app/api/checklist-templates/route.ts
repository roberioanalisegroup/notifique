import { getSupabaseForRequest } from "@/lib/api-auth";
import type { AlvaraChecklistTemplate, AlvaraChecklistTemplateItem } from "@/types";
import { NextRequest, NextResponse } from "next/server";

function parseLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : typeof x === "object" && x && "label" in x ? String((x as { label: unknown }).label).trim() : ""))
    .filter(Boolean)
    .slice(0, 200);
}

/** Lista templates do utilizador autenticado. */
export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("alvara_checklist_templates")
    .select(
      "id, name, description, created_by, source_alvara_id, created_at, updated_at, alvara_checklist_template_items(id)"
    )
    .eq("created_by", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, templates: [] }, { status: 500 });
  }

  const templates: AlvaraChecklistTemplate[] = (data ?? []).map((row) => {
    const items = row.alvara_checklist_template_items as { id: string }[] | null;
    const { alvara_checklist_template_items: _items, ...rest } = row;
    return {
      ...(rest as Omit<AlvaraChecklistTemplate, "item_count" | "items">),
      item_count: items?.length ?? 0,
    };
  });

  return NextResponse.json({ templates });
}

/** Cria template a partir de labels ou snapshot de um tipo de alvará. */
export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: {
    name?: string;
    description?: string | null;
    alvara_id?: string;
    items?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Indique o nome do template" }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: "Nome demasiado longo (máx. 200 caracteres)" }, { status: 400 });
  }

  const description =
    typeof body.description === "string" ? body.description.trim() || null : null;

  let labels = parseLabels(body.items);
  const alvaraId = typeof body.alvara_id === "string" ? body.alvara_id.trim() : "";

  if (alvaraId) {
    const { data: exists } = await supabase.from("alvaras").select("id").eq("id", alvaraId).maybeSingle();
    if (!exists) {
      return NextResponse.json({ error: "Tipo de alvará não encontrado" }, { status: 404 });
    }
    const { data: rows, error: loadErr } = await supabase
      .from("alvara_checklist_items")
      .select("label")
      .eq("alvara_id", alvaraId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (loadErr) {
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }
    labels = (rows ?? []).map((r) => r.label.trim()).filter(Boolean);
  }

  if (labels.length === 0) {
    return NextResponse.json(
      { error: "O template precisa de pelo menos uma etapa (ou escolha um tipo com etapas)" },
      { status: 400 }
    );
  }

  for (const label of labels) {
    if (label.length > 500) {
      return NextResponse.json({ error: "Uma etapa excede 500 caracteres" }, { status: 400 });
    }
  }

  const { data: template, error: tplErr } = await supabase
    .from("alvara_checklist_templates")
    .insert({
      name,
      description,
      created_by: userId,
      source_alvara_id: alvaraId || null,
    })
    .select("*")
    .single();

  if (tplErr || !template) {
    return NextResponse.json({ error: tplErr?.message ?? "Erro ao criar template" }, { status: 500 });
  }

  const itemRows = labels.map((label, i) => ({
    template_id: template.id,
    label,
    sort_order: i,
  }));

  const { data: insertedItems, error: itemsErr } = await supabase
    .from("alvara_checklist_template_items")
    .insert(itemRows)
    .select("*");

  if (itemsErr) {
    await supabase.from("alvara_checklist_templates").delete().eq("id", template.id);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  // Se o template foi criado a partir de um alvará específico, associa-o imediatamente no banco
  if (alvaraId) {
    await supabase
      .from("alvaras")
      .update({ checklist_template_id: template.id })
      .eq("id", alvaraId);
  }

  return NextResponse.json({
    template: {
      ...(template as AlvaraChecklistTemplate),
      items: (insertedItems ?? []) as AlvaraChecklistTemplateItem[],
      item_count: insertedItems?.length ?? 0,
    },
  });
}

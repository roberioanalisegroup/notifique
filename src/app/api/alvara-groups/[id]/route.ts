import { getSupabaseForRequest } from "@/lib/api-auth";
import type { AlvaraGroup } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Partial<AlvaraGroup>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("alvara_groups")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ group: data as AlvaraGroup });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { count } = await supabase
    .from("alvaras")
    .select("id", { count: "exact", head: true })
    .eq("group_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Não é possível excluir: existem alvarás neste grupo" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("alvara_groups").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

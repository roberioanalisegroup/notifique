import { getSupabaseForRequest } from "@/lib/api-auth";
import type { AlvaraGroup } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const onlyActive = request.nextUrl.searchParams.get("only_active") === "true";
  let q = supabase
    .from("alvara_groups")
    .select("*")
    .order("name", { ascending: true });

  if (onlyActive) {
    q = q.eq("is_active", true);
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message, groups: [] }, { status: 500 });
  }
  return NextResponse.json({ groups: data as AlvaraGroup[] });
}

export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Partial<AlvaraGroup>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("alvara_groups")
    .insert({
      name: body.name.trim(),
      description: body.description ?? null,
      color: body.color ?? "#3b82f6",
      icon: body.icon ?? "file-text",
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ group: data as AlvaraGroup });
}

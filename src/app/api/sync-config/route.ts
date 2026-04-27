import { getSupabaseForRequest } from "@/lib/api-auth";
import { SYNC_CONFIG_ID } from "@/lib/sync-helpers";
import type { SyncConfig } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("sync_config")
    .select("*")
    .eq("id", SYNC_CONFIG_ID)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ config: data as SyncConfig });
}

export async function PATCH(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: Partial<{
    sync_enabled: boolean;
    sync_time: string;
    date_start: string | null;
    date_end: string | null;
    only_active: boolean;
  }>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sync_config")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", SYNC_CONFIG_ID)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ config: data as SyncConfig });
}

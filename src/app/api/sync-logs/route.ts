import { getSupabaseForRequest } from "@/lib/api-auth";
import type { SyncLog } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = request.nextUrl;
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20)
  );

  const { data, error } = await supabase
    .from("sync_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message, logs: [] }, { status: 500 });
  }
  return NextResponse.json({ logs: data as SyncLog[] });
}

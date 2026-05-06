import { getSupabaseForRequest } from "@/lib/api-auth";
import type { CompanyHistoryEvent } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(_request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (cErr || !company) {
    return NextResponse.json({ error: "Empresa não encontrada", events: [] }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("company_history")
    .select("id, company_id, event_type, summary, metadata, created_at, actor_user_id")
    .eq("company_id", id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json(
      { error: error.message, events: [] },
      { status: 500 }
    );
  }

  const list = (rows ?? []) as Omit<CompanyHistoryEvent, "actor_display_name">[];
  const actorIds = Array.from(
    new Set(
      list.map((r) => r.actor_user_id).filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );

  const names: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", actorIds);
    for (const p of profs ?? []) {
      names[p.id] = (p.display_name as string | null)?.trim() || "—";
    }
  }

  const events: CompanyHistoryEvent[] = list.map((r) => ({
    ...r,
    actor_display_name: r.actor_user_id ? (names[r.actor_user_id] ?? "—") : null,
  }));

  return NextResponse.json({ events });
}

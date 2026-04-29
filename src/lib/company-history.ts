import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyHistoryEventType } from "@/types";

export async function logCompanyHistory(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    eventType: CompanyHistoryEventType;
    summary: string;
    metadata?: Record<string, unknown>;
    actorUserId: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("company_history").insert({
    company_id: params.companyId,
    event_type: params.eventType,
    summary: params.summary,
    metadata: params.metadata ?? {},
    actor_user_id: params.actorUserId,
  });
  if (error) {
    console.error("[company_history]", error.message);
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEventType =
  | "sync_all_triggered"
  | "users_created"
  | "users_updated"
  | "collaborators_listed"
  | "security_blocked_origin"
  | "csv_import_rejected";

export async function insertAuditLog(
  supabase: SupabaseClient,
  input: {
    event_type: AuditEventType;
    actor_user_id?: string | null;
    actor_email?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    request_id?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      event_type: input.event_type,
      actor_user_id: input.actor_user_id ?? null,
      actor_email: input.actor_email ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
      request_id: input.request_id ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // best-effort
  }
}


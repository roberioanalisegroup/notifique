import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEventType =
  | "sync_all_triggered"
  | "users_created"
  | "users_updated"
  | "collaborators_listed"
  | "security_blocked_origin"
  | "csv_import_rejected"
  | "authn_login_fail"
  | "authn_login_success"
  | "authz_fail";

function sanitizeForSIEM(input: Record<string, any>) {
  // Mascara dados PII / Confidenciais comuns
  const sanitized = { ...input };
  if (sanitized.actor_email) {
    sanitized.actor_email = "***@***.***";
  }
  if (sanitized.metadata) {
    const safeMeta = { ...sanitized.metadata };
    if ("password" in safeMeta) safeMeta.password = "***";
    if ("token" in safeMeta) safeMeta.token = "***";
    sanitized.metadata = safeMeta;
  }
  return sanitized;
}

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
  const logData = {
    event_type: input.event_type,
    actor_user_id: input.actor_user_id ?? null,
    actor_email: input.actor_email ?? null,
    ip: input.ip ?? null,
    user_agent: input.user_agent ?? null,
    request_id: input.request_id ?? null,
    metadata: input.metadata ?? {},
  };

  // Exportar para stdout em formato JSON (Prevenção de Log Injection / CRLF)
  const siemLog = sanitizeForSIEM({ timestamp: new Date().toISOString(), ...logData });
  console.log(JSON.stringify(siemLog));

  try {
    await supabase.from("audit_logs").insert(logData);
  } catch {
    // best-effort
  }
}

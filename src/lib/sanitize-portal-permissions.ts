import { PORTAL_SCREEN_DEFS } from "@/config/portal-screens";
import type { PortalPermissionsMap } from "@/types";

const KEYS = new Set(PORTAL_SCREEN_DEFS.filter((x) => !x.adminOnly).map((x) => x.key));

/** Valor direto da coluna `profiles.portal_permissions`. */
export function parsePortalPermissionsFromDb(raw: unknown): PortalPermissionsMap | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as PortalPermissionsMap;
}

/** "Sem restrição" para não-admin: edição explícita em todas as telas não exclusivas de admin. */
export function fullPortalEditMap(): PortalPermissionsMap {
  const out: PortalPermissionsMap = {};
  for (const k of KEYS) out[k] = "edit";
  return out;
}

export function sanitizePortalPermissions(input: unknown): PortalPermissionsMap {
  const out: PortalPermissionsMap = {};
  if (input == null || typeof input !== "object") return {};
  for (const [k, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!KEYS.has(k)) continue;
    if (raw !== "read" && raw !== "edit") continue;
    out[k] = raw as "read" | "edit";
  }
  return out;
}

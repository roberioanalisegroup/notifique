import { parsePortalPermissionsFromDb } from "@/lib/sanitize-portal-permissions";
import type { PortalPermissionsMap, PortalUser } from "@/types";
import type { User } from "@supabase/supabase-js";

export type ProfileRow = {
  id: string;
  display_name: string | null;
  phone: string | null;
  role?: string | null;
  is_active?: boolean | null;
  portal_permissions?: unknown;
  created_at: string;
  updated_at: string;
};

export function mapAuthUserToPortalUser(u: User, profile?: ProfileRow): PortalUser {
  const role = profile?.role === "admin" ? "admin" : "user";
  const is_active = profile?.is_active ?? true;
  const portal_permissions: PortalPermissionsMap | null = parsePortalPermissionsFromDb(profile?.portal_permissions);
  return {
    id: u.id,
    email: u.email ?? null,
    display_name: profile?.display_name ?? (u.user_metadata?.display_name as string | undefined) ?? null,
    phone: profile?.phone ?? (u.user_metadata?.phone as string | undefined) ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    created_at: u.created_at,
    role,
    is_active,
    banned_until: u.banned_until ?? null,
    portal_permissions,
  };
}

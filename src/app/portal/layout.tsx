import { PortalLayoutClient } from "@/app/portal/portal-layout-client";
import { parsePortalPermissionsFromDb } from "@/lib/sanitize-portal-permissions";
import { createClient } from "@/lib/supabase/server";
import type { PortalPermissionsMap } from "@/types";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile: {
    role: string | null;
    portal_permissions: PortalPermissionsMap | null;
  } = { role: "user", portal_permissions: null };

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      const { data } = await supabase
        .from("profiles")
        .select("role, portal_permissions")
        .eq("id", user.id)
        .maybeSingle();
      profile = {
        role: (data?.role as string | undefined) ?? "user",
        portal_permissions: parsePortalPermissionsFromDb(data?.portal_permissions),
      };
    }
  } catch {
    /* placeholders / env incompleta no build */
  }

  return <PortalLayoutClient profile={profile}>{children}</PortalLayoutClient>;
}

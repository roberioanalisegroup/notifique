import { PORTAL_SCREEN_DEFS } from "@/config/portal-screens";
import type { PortalPermissionsMap } from "@/types";

function normalizePortalPath(pathname: string): string {
  const p = pathname.split("?")[0] ?? pathname;
  if (!p.startsWith("/")) return "/" + p;
  return p;
}

export function resolveMatchedScreen(normalizedPortalPathname: string) {
  const sorted = [...PORTAL_SCREEN_DEFS].sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);
  const path = normalizedPortalPathname.startsWith("/portal") ? normalizedPortalPathname : `/portal${normalizedPortalPathname}`;
  for (const def of sorted) {
    const pre = def.pathPrefix;
    if (path === pre || path.startsWith(pre + "/")) {
      return def;
    }
  }
  return null;
}

/**
 * Para utilizadores não admin: portal_permissions=null → acesso "edit" a todas as áreas não adminOnly (legado).
 * Mapa definido só com chaves configuradas → chaves omitidas ficam como "none" exceto se null legacy.
 */
export function effectivePortalAccess(params: {
  role: string | null | undefined;
  portal_permissions: PortalPermissionsMap | null | undefined;
  screenKey: string;
  adminOnlyScreen?: boolean;
}): "none" | "read" | "edit" {
  if (params.role === "admin") {
    return params.adminOnlyScreen === true ? "edit" : "edit";
  }
  if (params.adminOnlyScreen) {
    return "none";
  }
  const raw = params.portal_permissions;
  if (raw == null) {
    return "edit";
  }
  const v = raw[params.screenKey];
  if (v === "read" || v === "edit") return v;
  return "none";
}

/** Use com perfil já carregado. */
export function accessForPortalPath(profile: {
  role?: string | null;
  portal_permissions?: PortalPermissionsMap | null;
}, pathname: string): "none" | "read" | "edit" {
  const p = normalizePortalPath(pathname);
  const def = resolveMatchedScreen(p);
  if (!def) return "none";
  return effectivePortalAccess({
    role: profile.role,
    portal_permissions: profile.portal_permissions ?? null,
    screenKey: def.key,
    adminOnlyScreen: def.adminOnly === true,
  });
}

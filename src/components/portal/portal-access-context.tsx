"use client";

import { accessForPortalPath } from "@/lib/portal-access";
import type { PortalPermissionsMap } from "@/types";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

export type PortalProfileAccess = {
  role: string | null;
  portal_permissions: PortalPermissionsMap | null;
};

const PortalAccessContext = createContext<PortalProfileAccess | null>(null);

export function PortalAccessProvider({
  profile,
  children,
}: {
  profile: PortalProfileAccess;
  children: ReactNode;
}) {
  return <PortalAccessContext.Provider value={profile}>{children}</PortalAccessContext.Provider>;
}

export function usePortalProfile(): PortalProfileAccess {
  const v = useContext(PortalAccessContext);
  return v ?? { role: "user", portal_permissions: null };
}

export function usePortalPathAccess(pathHref: string): "none" | "read" | "edit" {
  const p = usePortalProfile();
  return accessForPortalPath(p, pathHref);
}

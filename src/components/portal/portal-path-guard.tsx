"use client";

import { usePortalProfile } from "@/components/portal/portal-access-context";
import { accessForPortalPath, resolveMatchedScreen } from "@/lib/portal-access";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * Reforço client-side: URLs diretas sem permissão → sem-acesso (middleware já bloqueia no servidor).
 */
export function PortalPathGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const profile = usePortalProfile();
  const router = useRouter();

  useEffect(() => {
    if (!pathname?.startsWith("/portal") || pathname.startsWith("/portal/sem-acesso")) return;
    if (accessForPortalPath(profile, pathname) !== "none") return;
    const def = resolveMatchedScreen(pathname);
    const q = new URLSearchParams();
    if (def?.label) q.set("area", def.label);
    q.set("from", pathname);
    router.replace(`/portal/sem-acesso?${q.toString()}`);
  }, [pathname, profile, router]);

  if (
    pathname?.startsWith("/portal") &&
    !pathname.startsWith("/portal/sem-acesso") &&
    accessForPortalPath(profile, pathname) === "none"
  ) {
    return null;
  }

  return <>{children}</>;
}

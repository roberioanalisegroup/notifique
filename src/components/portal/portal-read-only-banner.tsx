"use client";

import { usePortalProfile } from "@/components/portal/portal-access-context";
import { accessForPortalPath } from "@/lib/portal-access";
import { usePathname } from "next/navigation";

export function PortalReadOnlyBanner() {
  const pathname = usePathname();
  const profile = usePortalProfile();

  if (!pathname?.startsWith("/portal") || pathname.startsWith("/portal/sem-acesso")) {
    return null;
  }

  const access = accessForPortalPath(profile, pathname);
  if (access !== "read") return null;

  return (
    <div
      className="mb-6 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-100"
      role="status"
    >
      <strong className="font-semibold">Modo só leitura.</strong> Pode consultar esta área, mas alterações e
      criações estão restritas nas suas permissões de portal.
    </div>
  );
}

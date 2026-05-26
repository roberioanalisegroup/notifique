"use client";

import { Navbar } from "@/components/layout/navbar";
import { PortalPathGuard } from "@/components/portal/portal-path-guard";
import { PortalReadOnlyBanner } from "@/components/portal/portal-read-only-banner";
import { PortalAccessProvider, type PortalProfileAccess } from "@/components/portal/portal-access-context";
import type { ReactNode } from "react";

export function PortalLayoutClient({
  profile,
  children,
}: {
  profile: PortalProfileAccess;
  children: ReactNode;
}) {
  return (
    <PortalAccessProvider profile={profile}>
      <div className="flex min-h-screen w-full flex-col bg-slate-50 text-slate-900 dark:bg-[#050816] dark:text-[#FFFFFF] transition-colors">
        <a
          href="#portal-main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-lg dark:focus:bg-slate-900 dark:focus:text-white"
        >
          Saltar para o conteúdo
        </a>
        <Navbar />
        <main id="portal-main-content" className="relative flex-1 w-full py-8" tabIndex={-1}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
            <PortalPathGuard>
              <PortalReadOnlyBanner />
              {children}
            </PortalPathGuard>
          </div>
        </main>
      </div>
    </PortalAccessProvider>
  );
}

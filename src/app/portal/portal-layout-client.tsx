"use client";

import { Navbar } from "@/components/layout/navbar";
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
        <Navbar />
        <main className="relative z-0 flex-1 w-full py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">{children}</div>
        </main>
      </div>
    </PortalAccessProvider>
  );
}

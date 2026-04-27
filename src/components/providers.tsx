"use client";

import { Toaster } from "sonner";
import { usePathname } from "next/navigation";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith("/auth");
  return (
    <>
      {children}
      <Toaster
        richColors
        position="top-right"
        theme={isAuth ? "light" : "system"}
      />
    </>
  );
}

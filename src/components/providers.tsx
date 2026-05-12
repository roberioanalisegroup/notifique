"use client";

import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Toaster } from "sonner";

function AppToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster richColors position="top-right" theme={resolved} />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ProvidersInner>{children}</ProvidersInner>
    </ThemeProvider>
  );
}

function ProvidersInner({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AppToaster />
    </>
  );
}

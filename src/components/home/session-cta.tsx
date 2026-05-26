"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

export function SessionCta() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <div className="flex h-12 items-center justify-center gap-3 sm:justify-start">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700" />
        <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-200/50 dark:bg-slate-800" />
      </div>
    );
  }

  if (hasSession) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/portal/dashboard"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0071E3] px-8 text-sm font-semibold text-white shadow-md shadow-[#0071E3]/15 transition duration-150 hover:opacity-95 active:scale-[0.98]"
        >
          Ir ao portal
          <ChevronRight className="h-4 w-4" />
        </Link>
        <p className="text-center text-sm text-[#6E6E73] dark:text-[#AEAEB2] sm:text-left">
          Sessão ativa. Pode continuar na gestão de alvarás.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Link
        href="/auth/login"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0071E3] px-8 text-sm font-semibold text-white shadow-md shadow-[#0071E3]/15 transition duration-150 hover:opacity-95 active:scale-[0.98]"
      >
        Entrar
        <ChevronRight className="h-4 w-4" />
      </Link>

    </div>
  );
}

export function HomeBrandIcon() {
  return (
    <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0071E3] to-[#4DA3FF] text-white shadow-md shadow-[#0071E3]/25">
      <Building2 className="h-7 w-7" />
    </div>
  );
}

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
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500"
        >
          Ir ao portal
          <ChevronRight className="h-4 w-4" />
        </Link>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 sm:text-left">
          Sessão ativa. Pode continuar na gestão de alvarás.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Link
        href="/auth/login"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500"
      >
        Entrar
        <ChevronRight className="h-4 w-4" />
      </Link>
      <Link
        href="/auth/register"
        className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      >
        Criar conta
      </Link>
    </div>
  );
}

export function HomeBrandIcon() {
  return (
    <div className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
      <Building2 className="h-8 w-8" />
    </div>
  );
}

"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/portal/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
          toast.error(
            "E-mail ainda não confirmado. Abra a caixa de entrada e clique no link, ou desative a confirmação em Supabase → Authentication → Providers → Email."
          );
        } else if (
          msg.includes("invalid login") ||
          msg.includes("invalid credentials")
        ) {
          toast.error("E-mail ou senha incorretos.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Login realizado");
      // Navegação completa para o middleware receber os cookies de sessão
      if (typeof window !== "undefined") {
        window.location.assign(next);
      } else {
        router.push(next);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Entrar
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Use o e-mail e a senha da sua conta para aceder ao portal.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-900 dark:text-slate-200" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-900 dark:text-slate-200" htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            type="password"
            required
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
        <Link href="/auth/register" className="text-blue-600 hover:underline dark:text-blue-400">
          Criar conta (setup inicial)
        </Link>
      </p>
    </div>
  );
}

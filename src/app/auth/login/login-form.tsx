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
    <div className="rounded-[18px] border border-black/5 bg-white p-8 shadow-portal dark:border-white/5 dark:bg-[#2C2C2E] transition-all duration-300">
      <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F] dark:text-white">
        Entrar
      </h1>
      <p className="mt-2 text-sm text-[#6E6E73] dark:text-[#AEAEB2]">
        Use o e-mail e a senha da sua conta para aceder ao portal.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="form-label" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input-field mt-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            type="password"
            required
            className="input-field mt-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full h-11 text-sm font-semibold mt-6 shadow-sm disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm">
        <Link href="/auth/register" className="text-[#0071E3] font-medium hover:underline dark:text-[#4DA3FF]">
          Criar conta (setup inicial)
        </Link>
      </p>
    </div>
  );
}

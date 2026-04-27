"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: origin
            ? `${origin}/auth/callback?next=/portal/dashboard`
            : undefined,
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data.user && !data.session) {
        toast.success(
          "Conta criada. Abra o e-mail e clique no link de confirmação para depois poder entrar. (Em desenvolvimento, podes desligar a confirmação em Supabase → Authentication → Providers → E-mail.)"
        );
        router.push("/auth/login");
        router.refresh();
        return;
      }
      if (data.session) {
        toast.success("Conta criada. A redirecionar…");
        window.location.assign("/portal/dashboard");
        return;
      }
      toast.success("Conta criada.");
      router.push("/auth/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Criar conta
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Recomendado para o primeiro utilizador ou ambiente de testes.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Criando…" : "Criar conta"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        <Link href="/auth/login" className="text-blue-600 hover:underline">
          Já tenho conta
        </Link>
      </p>
    </div>
  );
}

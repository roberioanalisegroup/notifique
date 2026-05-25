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
    <div className="rounded-[18px] border border-black/5 bg-white p-8 shadow-portal dark:border-white/5 dark:bg-[#2C2C2E] transition-all duration-300">
      <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F] dark:text-white">
        Criar conta
      </h1>
      <p className="mt-2 text-sm text-[#6E6E73] dark:text-[#AEAEB2]">
        Recomendado para o primeiro utilizador ou ambiente de testes.
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
            minLength={6}
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
          {loading ? "Criando…" : "Criar conta"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm">
        <Link href="/auth/login" className="text-[#0071E3] font-medium hover:underline dark:text-[#4DA3FF]">
          Já tenho conta
        </Link>
      </p>
    </div>
  );
}

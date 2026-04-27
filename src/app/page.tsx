import { HomeBrandIcon, SessionCta } from "@/components/home/session-cta";
import { FileStack, RefreshCw, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Início | Portal de Empresas e Alvarás",
  description:
    "Gestão de empresas, CNPJ, alvarás e sincronização com a Receita Federal.",
};

const features = [
  {
    icon: Users,
    title: "Empresas e CNPJ",
    text: "Cadastro, importação em CSV e sincronização com a BrasilAPI.",
  },
  {
    icon: FileStack,
    title: "Alvarás",
    text: "Grupos, tipos de alvará e vínculo com cada empresa com prazos e notificações.",
  },
  {
    icon: RefreshCw,
    title: "Sincronização",
    text: "Atualize dados cadastrais manualmente ou em lote, com registo de histórico.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Users className="h-5 w-5" />
            </span>
            Portal Alvarás
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/auth/login"
              className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Entrar
            </Link>
            <Link
              href="/auth/register"
              className="rounded-lg bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
        <div className="max-w-2xl">
          <HomeBrandIcon />
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Gestão de empresas e alvarás
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            Centralize o cadastro de CNPJ, acompanhe situação na Receita, organize
            alvarás por grupo e nunca perca o prazo de vencimento.
          </p>
          <div className="mt-10">
            <SessionCta />
          </div>
        </div>

        <ul className="mt-20 grid gap-6 sm:grid-cols-3">
          {features.map((f) => (
            <li
              key={f.title}
              className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-800/40"
            >
              <f.icon
                className="h-9 w-9 text-blue-600 dark:text-blue-400"
                strokeWidth={1.5}
              />
              <h2 className="mt-3 font-semibold text-slate-900 dark:text-white">
                {f.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {f.text}
              </p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-500">
        Portal de gestão · dados consultados via BrasilAPI
      </footer>
    </div>
  );
}

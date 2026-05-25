import { HomeBrandIcon, SessionCta } from "@/components/home/session-cta";
import { ThemeToggle } from "@/components/theme-toggle";
import { FileStack, RefreshCw, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Início | Analise Alvará - Gestão de Alvarás",
  description:
    "Análise e gestão de alvarás, empresas, CNPJ e sincronização com a Receita Federal.",
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
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] dark:bg-[#1C1C1E] dark:text-[#F5F5F7] selection:bg-[#0071E3]/20 selection:text-[#0071E3] transition-colors duration-300">
      <header className="sticky top-0 z-50 border-b border-black/5 bg-white/70 backdrop-blur-xl dark:border-white/5 dark:bg-[#1C1C1E]/70 transition-all duration-300">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight hover:opacity-90 transition-opacity">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-tr from-[#0071E3] to-[#4DA3FF] text-white shadow-sm shadow-[#0071E3]/20">
              <Users className="h-5 w-5" />
            </span>
            <span className="font-bold">Analise <span className="text-[#0071E3]">Alvará</span></span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <ThemeToggle compact className="mr-1" />
            <Link
              href="/auth/login"
              className="rounded-full px-4 py-2 font-medium text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/5 dark:text-[#AEAEB2] dark:hover:text-white dark:hover:bg-white/5 transition-all duration-200"
            >
              Entrar
            </Link>
            <Link
              href="/auth/register"
              className="rounded-full bg-[#1d1d1f] px-5 py-2 font-medium text-white shadow-sm hover:opacity-90 active:scale-[0.98] dark:bg-[#f5f5f7] dark:text-[#1c1c1e] transition-all duration-150"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="max-w-2xl animate-fade-up [animation-duration:600ms]">
          <HomeBrandIcon />
          <h1 className="mt-6 text-4xl font-extrabold tracking-[-0.035em] text-[#1d1d1f] sm:text-5xl md:text-6xl dark:text-white leading-[1.08] text-balance bg-gradient-to-b from-[#1d1d1f] to-[#434347] bg-clip-text text-transparent dark:from-white dark:to-[#8E8E93]">
            Analise Alvará — Gestão de Alvarás
          </h1>
          <p className="mt-6 text-lg sm:text-xl leading-relaxed text-[#6E6E73] dark:text-[#AEAEB2] font-normal text-balance max-w-xl">
            Centralize o cadastro de CNPJ, acompanhe a situação na Receita Federal, organize alvarás por grupo e nunca perca o prazo de vencimento.
          </p>
          <div className="mt-10">
            <SessionCta />
          </div>
        </div>

        <ul className="mt-20 grid gap-6 sm:grid-cols-3">
          {features.map((f, i) => (
            <li
              key={f.title}
              className="card-portal p-6 group flex flex-col justify-between animate-fade-up"
              style={{ animationDelay: `${(i + 1) * 100}ms`, animationFillMode: "both" }}
            >
              <div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#E8F0FE] text-[#0071E3] dark:bg-[#1C3050]/60 dark:text-[#4DA3FF] shadow-sm mb-4 transition-transform duration-300 group-hover:scale-105">
                  <f.icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F] dark:text-white">
                  {f.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#6E6E73] dark:text-[#AEAEB2]">
                  {f.text}
                </p>
              </div>
              <div className="mt-4 h-1.5 w-0 rounded-full bg-[#0071E3] transition-all duration-300 group-hover:w-8" />
            </li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-black/5 py-12 text-center text-xs tracking-wider uppercase text-[#6E6E73] dark:border-white/5 dark:text-[#AEAEB2]/60 px-6 max-w-5xl mx-auto">
        Gestão de alvarás · Dados sincronizados de forma segura via BrasilAPI
      </footer>
    </div>
  );
}

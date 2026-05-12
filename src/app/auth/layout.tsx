import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-100 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle compact />
      </div>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <Link
          href="/"
          className="mb-6 text-sm font-medium text-slate-500 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
        >
          ← Voltar ao início
        </Link>
        {children}
      </div>
    </div>
  );
}

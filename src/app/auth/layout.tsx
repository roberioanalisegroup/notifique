import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#F5F5F7] dark:bg-[#1C1C1E] transition-colors duration-300">
      <div className="absolute right-6 top-6 z-10 animate-fade-up">
        <ThemeToggle compact />
      </div>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12 animate-fade-up [animation-duration:500ms]">
        <Link
          href="/"
          className="mb-6 self-start inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/5 dark:text-[#AEAEB2] dark:hover:text-white dark:hover:bg-white/5 transition-all duration-200"
        >
          ← Voltar ao início
        </Link>
        {children}
      </div>
    </div>
  );
}

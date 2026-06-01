"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";

const VantaCloudsBackground = dynamic(
  () =>
    import("@/components/auth/vanta-clouds-background").then((m) => ({
      default: m.VantaCloudsBackground,
    })),
  { ssr: false }
);

export function AuthLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/auth/login";

  return (
    <div
      className={cn(
        "relative min-h-screen transition-colors duration-300",
        !isLogin && "bg-[#F5F5F7] dark:bg-[#1C1C1E]"
      )}
    >
      {isLogin && <VantaCloudsBackground />}
      {isLogin && (
        <div
          className="pointer-events-none fixed inset-0 z-[1] bg-[#F5F5F7]/25 dark:bg-[#1C1C1E]/35"
          aria-hidden="true"
        />
      )}
      <div className="absolute right-6 top-6 z-20 animate-fade-up">
        <ThemeToggle compact />
      </div>
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12 animate-fade-up [animation-duration:500ms]">
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

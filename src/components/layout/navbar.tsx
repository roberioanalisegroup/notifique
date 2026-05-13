"use client";

import { usePortalProfile } from "@/components/portal/portal-access-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { accessForPortalPath } from "@/lib/portal-access";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  Building2,
  CalendarCheck,
  ChevronDown,
  FileStack,
  LayoutDashboard,
  Menu,
  Settings,
  X,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  parentNavigates?: boolean;
  children?: { href: string; label: string }[];
};

const items: Item[] = [
  {
    id: "dashboard",
    href: "/portal/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="h-4 w-4 shrink-0" />,
  },
  {
    id: "acompanhamento",
    href: "/portal/acompanhamento",
    label: "Acompanhamento",
    icon: <CalendarCheck className="h-4 w-4 shrink-0" />,
    parentNavigates: true,
  },
  {
    id: "empresas",
    href: "/portal/empresas",
    label: "Empresas",
    icon: <Building2 className="h-4 w-4 shrink-0" />,
    parentNavigates: true,
    children: [
      { href: "/portal/empresas/importar", label: "Importar" },
      { href: "/portal/empresas/responsaveis", label: "Responsáveis" },
    ],
  },
  {
    id: "alvaras",
    href: "/portal/alvaras",
    label: "Alvarás",
    icon: <FileStack className="h-4 w-4 shrink-0" />,
    parentNavigates: true,
    children: [
      { href: "/portal/alvaras/grupos", label: "Grupos" },
      { href: "/portal/alvaras/etapas", label: "Etapas" },
      { href: "/portal/alvaras/importar", label: "Importar" },
    ],
  },
  {
    id: "config",
    href: "/portal/configuracoes/sincronizacao",
    label: "Configurações",
    icon: <Settings className="h-4 w-4 shrink-0" />,
    children: [
      { href: "/portal/configuracoes/sincronizacao", label: "Sincronização" },
      { href: "/portal/configuracoes/usuarios", label: "Usuários" },
      { href: "/portal/acompanhamento/geracao", label: "Geração e manutenção" },
    ],
  },
];

function UserMenuTopBar() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const email = data.user.email ?? "";
        const name = email.split("@")[0] ?? "Usuário";
        setUser({ name, email });
      }
    });
  }, [supabase]);

  async function signOut() {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      router.push("/auth/login");
      router.refresh();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {user && (
        <div className="hidden lg:block text-right">
          <p className="text-sm font-semibold text-slate-800 dark:text-white">{user.name}</p>
          <p className="text-xs text-slate-500 dark:text-[#9CA3AF]">{user.email}</p>
        </div>
      )}
      <button
        type="button"
        onClick={signOut}
        disabled={loading}
        title="Sair"
        className="flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-all hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-[#9CA3AF] dark:hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:border-red-500/30"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">{loading ? "..." : "Sair"}</span>
      </button>
    </div>
  );
}

function NavItemDesktop({ item }: { item: Item }) {
  const pathname = usePathname();
  const profile = usePortalProfile();
  const allow = useCallback(
    (href: string) => accessForPortalPath(profile, href) !== "none",
    [profile]
  );
  const childFiltered = useMemo(
    () => item.children?.filter((c) => allow(c.href)) ?? [],
    [item.children, allow]
  );
  const sectionVisible =
    !!item.children && item.children.length > 0 ? allow(item.href) || childFiltered.length > 0 : allow(item.href);

  const [flyoutOpen, setFlyoutOpen] = useState(false);

  const active =
    pathname === item.href ||
    (item.href !== "/" && pathname?.startsWith(item.href)) ||
    false;

  if (!sectionVisible) return null;

  if (item.children) {
    return (
      <div 
        className="relative"
        onMouseEnter={() => setFlyoutOpen(true)}
        onMouseLeave={() => setFlyoutOpen(false)}
      >
        <div className="flex items-center">
          {allow(item.href) && item.parentNavigates ? (
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-l-full px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-600 text-white shadow-sm dark:bg-[#2F6BFF] dark:shadow-glow"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-[#9CA3AF] dark:hover:text-white dark:hover:bg-white/5"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ) : (
            <div
              className={cn(
                "flex cursor-default items-center gap-2 rounded-l-full px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-700 dark:bg-[#2F6BFF]/10 dark:text-[#4DA3FF]"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-[#9CA3AF] dark:hover:text-white dark:hover:bg-white/5"
              )}
            >
              {item.icon}
              {item.label}
            </div>
          )}
          <button
            type="button"
            className={cn(
              "flex items-center justify-center rounded-r-full px-2 py-2 transition-colors",
              active
                ? "bg-blue-600 text-white shadow-sm dark:bg-[#2F6BFF] dark:shadow-glow"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-[#9CA3AF] dark:hover:bg-white/5 dark:hover:text-white"
            )}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {flyoutOpen && (
          <div className="absolute left-0 top-full pt-2 z-50">
            <div className="min-w-[14rem] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#131C2E] dark:shadow-portal-md dark:backdrop-blur-md">
              {childFiltered.map((c) => {
                const cActive = pathname === c.href;
                return (
                  <Link
                    key={c.href}
                    href={c.href}
                    onClick={() => setFlyoutOpen(false)}
                    className={cn(
                      "block rounded-xl px-4 py-2.5 text-sm transition-all",
                      cActive
                        ? "text-blue-700 bg-blue-50 font-semibold dark:text-[#4DA3FF] dark:bg-[#2F6BFF]/10"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-[#9CA3AF] dark:hover:bg-white/5 dark:hover:text-white"
                    )}
                  >
                    {c.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-blue-600 text-white shadow-sm dark:bg-[#2F6BFF] dark:shadow-glow"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-[#9CA3AF] dark:hover:bg-white/5 dark:hover:text-white"
      )}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

function NavItemMobile({ item, closeMenu }: { item: Item; closeMenu: () => void }) {
  const pathname = usePathname();
  const profile = usePortalProfile();
  const allow = useCallback(
    (href: string) => accessForPortalPath(profile, href) !== "none",
    [profile]
  );
  const childFiltered = useMemo(
    () => item.children?.filter((c) => allow(c.href)) ?? [],
    [item.children, allow]
  );
  const sectionVisible =
    !!item.children && item.children.length > 0 ? allow(item.href) || childFiltered.length > 0 : allow(item.href);

  const active =
    pathname === item.href ||
    (item.href !== "/" && pathname?.startsWith(item.href)) ||
    false;

  if (!sectionVisible) return null;

  return (
    <div className="mb-2">
      <Link
        href={allow(item.href) ? item.href : "#"}
        onClick={allow(item.href) ? closeMenu : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
          active
            ? "bg-blue-50 text-blue-700 dark:bg-[#2F6BFF]/10 dark:text-[#4DA3FF]"
            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-[#9CA3AF] dark:hover:bg-white/5 dark:hover:text-white"
        )}
      >
        {item.icon}
        {item.label}
      </Link>
      {item.children && childFiltered.length > 0 && (
        <div className="mt-1 ml-4 border-l border-slate-200 pl-4 flex flex-col gap-1 dark:border-white/10">
          {childFiltered.map((c) => {
            const cActive = pathname === c.href;
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={closeMenu}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm transition-colors",
                  cActive
                    ? "text-blue-700 font-medium bg-blue-50/50 dark:text-[#4DA3FF] dark:bg-[#2F6BFF]/5"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-[#9CA3AF] dark:hover:text-white dark:hover:bg-white/5"
                )}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur-xl shadow-sm dark:border-white/5 dark:bg-[#050816]/80 transition-colors">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/portal/dashboard" className="flex items-center gap-2.5 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-sm transition-transform group-hover:scale-105 dark:bg-[#2F6BFF] dark:shadow-glow">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="hidden text-xl font-bold tracking-tight text-slate-900 sm:block dark:text-white">
                Analise <span className="text-blue-600 dark:text-[#4DA3FF]">Alvarás</span>
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {items.map((item) => (
                <NavItemDesktop key={item.id} item={item} />
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block">
              <ThemeToggle compact />
            </div>
            
            <div className="hidden sm:block">
              <UserMenuTopBar />
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:text-slate-900 lg:hidden transition-colors dark:bg-white/5 dark:text-[#9CA3AF] dark:hover:text-white"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 lg:hidden dark:bg-[#050816]">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 border-b border-slate-200 dark:border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-sm dark:bg-[#2F6BFF] dark:shadow-glow">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-white">Analise <span className="text-blue-600 dark:text-[#4DA3FF]">Alvarás</span></span>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors dark:bg-white/5 dark:text-[#9CA3AF] dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <nav className="flex flex-col">
              {items.map((item) => (
                <NavItemMobile key={item.id} item={item} closeMenu={() => setMobileMenuOpen(false)} />
              ))}
            </nav>
          </div>
          
          <div className="border-t border-slate-200 p-4 sm:px-6 flex justify-between items-center dark:border-white/5">
            <ThemeToggle compact />
            <UserMenuTopBar />
          </div>
        </div>
      )}
    </>
  );
}

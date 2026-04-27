"use client";

import { UserMenu } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  FileStack,
  LayoutDashboard,
  Menu,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "portal-sidebar-collapsed";

type Item = {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  children?: { href: string; label: string }[];
};

const items: Item[] = [
  {
    id: "dashboard",
    href: "/portal/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="h-5 w-5 shrink-0" />,
  },
  {
    id: "empresas",
    href: "/portal/empresas",
    label: "Empresas",
    icon: <Building2 className="h-5 w-5 shrink-0" />,
    children: [
      { href: "/portal/empresas", label: "Lista" },
      { href: "/portal/empresas/importar", label: "Importar" },
    ],
  },
  {
    id: "alvaras",
    href: "/portal/alvaras",
    label: "Alvarás",
    icon: <FileStack className="h-5 w-5 shrink-0" />,
    children: [
      { href: "/portal/alvaras/grupos", label: "Grupos" },
      { href: "/portal/alvaras", label: "Tipos" },
      { href: "/portal/alvaras/importar", label: "Importar" },
    ],
  },
  {
    id: "config",
    href: "/portal/configuracoes/sincronizacao",
    label: "Configurações",
    icon: <Settings className="h-5 w-5 shrink-0" />,
    children: [
      { href: "/portal/configuracoes/sincronizacao", label: "Sincronização" },
      { href: "/portal/configuracoes/usuarios", label: "Usuários" },
    ],
  },
];

function NavItem({
  item,
  collapsed,
  mobileClose,
  openFlyout,
  setOpenFlyout,
}: {
  item: Item;
  collapsed: boolean;
  mobileClose?: () => void;
  openFlyout: string | null;
  setOpenFlyout: (id: string | null) => void;
}) {
  const pathname = usePathname();
  const [accordionOpen, setAccordionOpen] = useState(
    item.children?.some(
      (c) => pathname === c.href || pathname?.startsWith(c.href + "/")
    ) ?? true
  );

  const active =
    pathname === item.href ||
    (item.href !== "/" && pathname?.startsWith(item.href)) ||
    false;

  const flyoutOpen = openFlyout === item.id;

  if (item.children && collapsed) {
    return (
      <div className="relative">
        <button
          type="button"
          title={item.label}
          onClick={() => setOpenFlyout(flyoutOpen ? null : item.id)}
          className={cn(
            "flex w-full items-center justify-center rounded-xl p-2.5 text-sm font-medium transition-colors",
            "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            flyoutOpen && "bg-slate-100 text-slate-900 ring-1 ring-slate-200/80"
          )}
        >
          {item.icon}
        </button>
        {flyoutOpen && (
          <div
            className="absolute left-full top-0 z-[70] ml-2 min-w-[11rem] overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1.5 shadow-portal-md ring-1 ring-slate-900/5"
            role="menu"
          >
            <p className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {item.label}
            </p>
            {item.children.map((c) => {
              const cActive = pathname === c.href;
              return (
                <Link
                  key={c.href}
                  href={c.href}
                  onClick={() => {
                    setOpenFlyout(null);
                    mobileClose?.();
                  }}
                  className={cn(
                    "block px-3 py-2 text-sm transition-colors",
                    cActive
                      ? "font-medium text-blue-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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

  if (!item.children) {
    return (
      <Link
        href={item.href}
        onClick={mobileClose}
        title={collapsed ? item.label : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl text-sm font-medium transition-colors",
          collapsed ? "justify-center p-2.5" : "px-3 py-2.5",
          active
            ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-600/20"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        )}
      >
        {item.icon}
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setAccordionOpen(!accordionOpen)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          {item.icon}
          <span className="truncate">{item.label}</span>
        </span>
        {accordionOpen ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
      </button>
      {accordionOpen && (
        <div className="mt-1 space-y-0.5 border-l-2 border-slate-200/80 pl-3 ml-1.5">
          {item.children.map((c) => {
            const cActive = pathname === c.href;
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={mobileClose}
                className={cn(
                  "block rounded-lg px-3 py-1.5 text-sm transition-colors",
                  cActive
                    ? "font-medium text-blue-700"
                    : "text-slate-500 hover:text-slate-900"
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

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  const effectiveCollapsed = collapsed && isDesktop;

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === "1") setCollapsed(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const setCollapsedPersist = useCallback((v: boolean) => {
    setCollapsed(v);
    setOpenFlyout(null);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!effectiveCollapsed) setOpenFlyout(null);
  }, [effectiveCollapsed]);

  useEffect(() => {
    if (!openFlyout) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const el = document.getElementById("portal-sidebar");
      if (el && !el.contains(target)) setOpenFlyout(null);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [openFlyout]);

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-md shadow-slate-200/50 md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] md:hidden"
          aria-label="Fechar"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        id="portal-sidebar"
        className={cn(
          "fixed z-50 flex h-screen w-[17rem] max-w-[85vw] flex-col border-slate-200/90 bg-white shadow-xl shadow-slate-200/40 transition-[transform,width] duration-300 ease-out [color-scheme:light]",
          "left-0 top-0",
          "md:relative md:max-w-none md:shadow-sm md:shadow-slate-200/30",
          "md:shrink-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0",
          hydrated && effectiveCollapsed && "md:w-[4.5rem] md:min-w-[4.5rem] md:max-w-[4.5rem]"
        )}
      >
        <div
          className={cn(
            "flex h-16 min-h-[4rem] shrink-0 items-center border-b border-slate-100",
            effectiveCollapsed ? "justify-center px-2" : "justify-between gap-1 px-3"
          )}
        >
          <div
            className={cn(
              "flex min-w-0 items-center gap-3",
              effectiveCollapsed && "md:justify-center"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm shadow-blue-600/30">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            {!effectiveCollapsed && (
              <div className="min-w-0 pr-1">
                <p className="truncate text-sm font-semibold leading-tight text-slate-900">
                  Portal de Gestão
                </p>
                <p className="truncate text-xs text-slate-500">Empresas e alvarás</p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setCollapsedPersist(!collapsed)}
              className="hidden rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 md:inline-flex"
              title={collapsed ? "Expandir menu" : "Recolher menu"}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {effectiveCollapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-visible p-2.5">
          {items.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              collapsed={effectiveCollapsed}
              mobileClose={() => setMobileOpen(false)}
              openFlyout={openFlyout}
              setOpenFlyout={setOpenFlyout}
            />
          ))}
        </nav>

        <UserMenu collapsed={effectiveCollapsed} />
      </aside>
    </>
  );
}

"use client";

import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type UserMenuProps = {
  collapsed?: boolean;
};

export function UserMenu({ collapsed = false }: UserMenuProps) {
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
      toast.success("Sessão encerrada");
      router.push("/auth/login");
      router.refresh();
    } catch {
      toast.error("Não foi possível sair");
    } finally {
      setLoading(false);
    }
  }

  if (collapsed) {
    return (
      <div className="shrink-0 border-t border-slate-100 p-2">
        <button
          type="button"
          onClick={signOut}
          disabled={loading}
          title={user ? `Sair (${user.email})` : "Sair"}
          className="flex w-full items-center justify-center rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-slate-100 bg-slate-50/50 p-3">
      {user && (
        <div className="mb-2 rounded-lg border border-slate-100/80 bg-white px-3 py-2 shadow-sm">
          <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
      )}
      <button
        type="button"
        onClick={signOut}
        disabled={loading}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-white hover:shadow-sm disabled:opacity-50"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {loading ? "Saindo…" : "Sair"}
      </button>
    </div>
  );
}

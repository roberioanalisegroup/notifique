"use client";

import { apiJson } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import {
  Building2,
  CheckCircle,
  RefreshCw,
  FileStack,
  AlertTriangle,
  Bell,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Kpis = {
  totalEmpresas: number;
  ativas: number;
  syncPendentes: number;
  totalAlvaras: number;
  alvarasVencidos: number;
  notificacoesNoMes: number;
};

type SyncLog = {
  id: string;
  started_at: string;
  finished_at: string | null;
  total: number;
  success: number;
  errors: number;
  skipped: number;
  triggered_by: string;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [vencendo, setVencendo] = useState<
    { id: string; numero: string | null; data_vencimento: string | null; companies: { cnpj: string; razao_social: string | null } | null; alvaras: { name: string } | null }[]
  >([]);

  useEffect(() => {
    let c = true;
    (async () => {
      try {
        const [s, l] = await Promise.all([
          apiJson<{
            kpis: Kpis;
            vencendoProx30Dias: typeof vencendo;
          }>("/api/stats"),
          apiJson<{ logs: SyncLog[] }>("/api/sync-logs?limit=5"),
        ]);
        if (!c) return;
        setKpis(s.kpis);
        setVencendo(s.vencendoProx30Dias);
        setLogs(l.logs);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar o dashboard");
      } finally {
        if (c) setLoading(false);
      }
    })();
    return () => {
      c = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <span className="text-sm">Carregando…</span>
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "TOTAL DE EMPRESAS",
      value: kpis?.totalEmpresas ?? 0,
      icon: <Building2 className="h-5 w-5" />,
      iconBg: "bg-blue-100 text-blue-600",
    },
    {
      label: "EMPRESAS ATIVAS",
      value: kpis?.ativas ?? 0,
      icon: <CheckCircle className="h-5 w-5" />,
      iconBg: "bg-green-100 text-green-600",
    },
    {
      label: "SYNC PENDENTE",
      value: kpis?.syncPendentes ?? 0,
      icon: <RefreshCw className="h-5 w-5" />,
      iconBg: "bg-rose-100 text-rose-600",
    },
    {
      label: "TIPOS DE ALVARÁS",
      value: kpis?.totalAlvaras ?? 0,
      icon: <FileStack className="h-5 w-5" />,
      iconBg: "bg-blue-100 text-blue-600",
    },
    {
      label: "ALVARÁS VENCIDOS",
      value: kpis?.alvarasVencidos ?? 0,
      icon: <AlertTriangle className="h-5 w-5" />,
      iconBg: "bg-orange-100 text-orange-600",
    },
    {
      label: "NOTIFICADOS NO MÊS",
      value: kpis?.notificacoesNoMes ?? 0,
      icon: <Bell className="h-5 w-5" />,
      iconBg: "bg-purple-100 text-purple-600",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Visão geral da gestão de alvarás e empresas no portal.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${c.iconBg}`}>
              {c.icon}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {c.label}
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
                {c.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Últimas sincronizações */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Últimas sincronizações
            </h2>
          </div>
          <div className="p-5">
            {logs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Nenhuma sincronização executada ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Início</th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500">OK</th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Erros</th>
                      <th className="pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Disparo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="py-2.5 pr-3">{formatDate(row.started_at)}</td>
                        <td className="py-2.5 pr-3">{row.total}</td>
                        <td className="py-2.5 pr-3 text-green-600">{row.success}</td>
                        <td className="py-2.5 pr-3 text-red-600">{row.errors}</td>
                        <td className="py-2.5">{row.triggered_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Alvarás vencendo */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Alvarás vencendo nos próximos 30 dias
            </h2>
          </div>
          <div className="p-5">
            {vencendo.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Nenhum alvará vence nos próximos 30 dias.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Empresa</th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Alvará</th>
                      <th className="pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Vencimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vencendo.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="py-2.5 pr-3">
                          {row.companies?.razao_social ?? row.companies?.cnpj ?? "—"}
                        </td>
                        <td className="py-2.5 pr-3">{row.alvaras?.name ?? "—"}</td>
                        <td className="py-2.5">{formatDate(row.data_vencimento)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

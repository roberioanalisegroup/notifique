"use client";

import { apiJson, apiFetch } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import type { SyncConfig, SyncLog } from "@/types";
import { formatDate } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

function durationSec(start: string, end: string | null) {
  if (!end) return "—";
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return "—";
  return `${Math.round((b - a) / 1000)}s`;
}

function SincronizacaoSkeleton() {
  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <div className="space-y-2">
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="card-portal p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-10 w-full max-w-xs" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
      <div className="card-portal overflow-hidden">
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

export default function SincConfigPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({
    sync_enabled: true,
    sync_time: "03:00",
    date_start: "",
    date_end: "",
    only_active: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, l] = await Promise.all([
        apiJson<{ config: SyncConfig }>("/api/sync-config"),
        apiJson<{ logs: SyncLog[] }>("/api/sync-logs?limit=20"),
      ]);
      setLogs(l.logs);
      const t = c.config.sync_time?.slice(0, 5) ?? "03:00";
      setForm({
        sync_enabled: c.config.sync_enabled,
        sync_time: t,
        date_start: c.config.date_start?.slice(0, 10) ?? "",
        date_end: c.config.date_end?.slice(0, 10) ?? "",
        only_active: c.config.only_active,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const sync_time = form.sync_time.length === 5 ? form.sync_time + ":00" : form.sync_time;
      await apiJson("/api/sync-config", {
        method: "PATCH",
        body: JSON.stringify({
          sync_enabled: form.sync_enabled,
          sync_time,
          date_start: form.date_start || null,
          date_end: form.date_end || null,
          only_active: form.only_active,
        }),
      });
      toast.success("Configurações salvas");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    try {
      const res = await apiFetch("/api/companies/sync-all", { method: "POST" });
      const j = (await res.json()) as {
        error?: string;
        success?: number;
        total?: number;
        cap_applied?: boolean;
        total_queued?: number;
        cap?: number;
        message?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Falha");
      let msg =
        j.message ?? `Concluído: ${j.success ?? 0}/${j.total ?? 0} empresas neste lote.`;
      if (j.cap_applied && j.total_queued != null) {
        msg += ` Processadas ${j.total} de ${j.total_queued} (máx. ${j.cap ?? "?"} por pedido; ajuste SYNC_MAX_COMPANIES se precisar).`;
      }
      toast.success(msg);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <SincronizacaoSkeleton />;

  return (
    <div className="max-w-3xl space-y-6 text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Sincronização com a Receita (BrasilAPI)
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Agendamento automático (cron no Supabase) e filtros de quais empresas entram na fila.
        </p>
      </div>

      <form
        className="card-portal space-y-5 p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
            checked={form.sync_enabled}
            onChange={(e) => setForm((f) => ({ ...f, sync_enabled: e.target.checked }))}
          />
          Sincronização automática diária (cron) ativada
        </label>
        <div>
          <label className="form-label" htmlFor="sync-time">
            Horário (referência; o cron roda no Supabase)
          </label>
          <input
            id="sync-time"
            type="time"
            className="input-field mt-1.5 max-w-xs"
            value={form.sync_time}
            onChange={(e) => setForm((f) => ({ ...f, sync_time: e.target.value }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="form-label" htmlFor="sync-start">
              Sincronizar empresas abertas a partir de
            </label>
            <input
              id="sync-start"
              type="date"
              className="input-field mt-1.5"
              value={form.date_start}
              onChange={(e) => setForm((f) => ({ ...f, date_start: e.target.value }))}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="sync-end">
              Até (data de abertura)
            </label>
            <input
              id="sync-end"
              type="date"
              className="input-field mt-1.5"
              value={form.date_end}
              onChange={(e) => setForm((f) => ({ ...f, date_end: e.target.value }))}
            />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
            checked={form.only_active}
            onChange={(e) => setForm((f) => ({ ...f, only_active: e.target.checked }))}
          />
          Sincronizar apenas situação ATIVA
        </label>
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? "Salvando…" : "Salvar configurações"}
        </button>
      </form>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Histórico</h2>
          <button
            type="button"
            onClick={runSync}
            disabled={syncing}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
          >
            {syncing ? "Sincronizando…" : "Executar sincronização agora"}
          </button>
        </div>
        <div className="card-portal overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-portal min-w-[600px]">
              <thead>
                <tr>
                  <th>Início</th>
                  <th>Total</th>
                  <th>OK</th>
                  <th>Erros</th>
                  <th>Tempo</th>
                  <th>Disparo</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.started_at, { empty: "—" })}</td>
                    <td className="tabular-nums">{row.total}</td>
                    <td className="tabular-nums">{row.success}</td>
                    <td className="tabular-nums">{row.errors}</td>
                    <td>{durationSec(row.started_at, row.finished_at)}</td>
                    <td className="text-slate-600">{row.triggered_by}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      Nenhum registro de sincronização
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

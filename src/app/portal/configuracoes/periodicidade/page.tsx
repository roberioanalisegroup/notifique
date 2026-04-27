"use client";

import { apiJson } from "@/lib/api-client";
import { FREQUENCIA_LABELS, formatLegalSummary } from "@/lib/alvara-frequency";
import type { Alvara, AlvaraGroup } from "@/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Row = Alvara & { alvara_groups: AlvaraGroup | null; vinculados?: number };

export default function PeriodicidadeConfigPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await apiJson<{ alvaras: Row[] }>("/api/alvaras");
        setRows(d.alvaras);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div>
        <Link
          href="/portal/configuracoes/sincronizacao"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Configurações
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Periodicidade dos tipos de alvará
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          A geração automática de tarefas (painel de acompanhamento) utiliza a{" "}
          <strong className="font-medium">frequência</strong> e a{" "}
          <strong className="font-medium">data legal</strong> (dia do mês, dia da semana, etc.)
          de cada tipo. Edite o tipo em <Link href="/portal/alvaras" className="text-blue-600 hover:underline">Alvarás → Tipos</Link>.
        </p>
      </div>

      <div className="card-portal overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-portal min-w-[800px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Grupo</th>
                <th>Periodicidade</th>
                <th>Regra (data legal)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    A carregar…
                  </td>
                </tr>
              ) : (
                rows.map((a) => {
                  const L = {
                    legal_dia: a.legal_dia,
                    legal_mes: a.legal_mes,
                    legal_dia_semana: a.legal_dia_semana,
                    legal_dias_uteis: a.legal_dias_uteis,
                  };
                  return (
                    <tr key={a.id}>
                      <td className="font-medium text-slate-900">{a.name}</td>
                      <td className="text-slate-600">{a.alvara_groups?.name ?? "Sem grupo"}</td>
                      <td className="text-slate-800">
                        {FREQUENCIA_LABELS[a.frequencia] ?? a.frequencia}
                      </td>
                      <td className="text-sm text-slate-600">
                        {formatLegalSummary(a.frequencia, L)}
                      </td>
                      <td>
                        <Link
                          href={
                            a.group_id
                              ? "/portal/alvaras?group_id=" + encodeURIComponent(a.group_id)
                              : "/portal/alvaras?sem_grupo=1"
                          }
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                          Abrir em Tipos
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    Nenhum tipo de alvará cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

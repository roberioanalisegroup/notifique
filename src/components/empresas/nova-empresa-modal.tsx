"use client";

import { apiJson, apiFetch } from "@/lib/api-client";
import { formatCNPJ, cleanCNPJ } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import type { Company } from "@/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function maskCnpjInput(v: string): string {
  const d = cleanCNPJ(v).slice(0, 14);
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  let s = p1;
  if (p2) s += "." + p2;
  if (p3) s += "." + p3;
  if (p4) s += "/" + p4;
  if (p5) s += "-" + p5;
  return s;
}

export function NovaEmpresaModal({ open, onClose, onSaved }: Props) {
  const [cnpj, setCnpj] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [readOnly, setReadOnly] = useState<Partial<Company> | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function onBlurCnpj() {
    if (cleanCNPJ(cnpj).length !== 14) return;
    setSyncing(true);
    setReadOnly(null);
    try {
      const res = await apiFetch("/api/companies/sync-single", {
        method: "POST",
        body: JSON.stringify({ cnpj }),
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as { company: Company | null; error: string | null; notFound?: boolean };
      if (!res.ok) {
        toast.error(data.error ?? "Não foi possível consultar o CNPJ");
        return;
      }
      if (data.company) {
        setReadOnly(data.company);
        toast.success("Dados carregados da Receita");
      } else {
        toast.message("CNPJ não encontrado", {
          description: "Você ainda pode salvar apenas o número do CNPJ",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncing(false);
    }
  }

  async function onSave() {
    if (cleanCNPJ(cnpj).length !== 14) {
      toast.error("CNPJ inválido");
      return;
    }
    setSaving(true);
    try {
      if (readOnly?.id) {
        onSaved();
        onClose();
        return;
      }
      await apiJson("/api/companies", {
        method: "POST",
        body: JSON.stringify({
          cnpj,
          razao_social: readOnly?.razao_social ?? null,
        }),
      });
      toast.success("Empresa salva");
      onSaved();
      onClose();
      setCnpj("");
      setReadOnly(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-portal-md">
        <h2 className="text-lg font-semibold text-slate-900">Nova empresa</h2>
        <p className="mt-1 text-sm text-slate-500">O CNPJ é consultado na BrasilAPI ao sair do campo.</p>
        <div className="mt-5 space-y-4 text-sm">
          <div>
            <label className="form-label" htmlFor="nova-empresa-cnpj">
              CNPJ
            </label>
            <div className="relative mt-1.5">
              <input
                id="nova-empresa-cnpj"
                className="input-field pr-10"
                value={cnpj}
                onChange={(e) => setCnpj(maskCnpjInput(e.target.value))}
                onBlur={onBlurCnpj}
                placeholder="00.000.000/0000-00"
              />
              {syncing && (
                <span className="absolute right-3 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              )}
            </div>
          </div>
          {readOnly && (
            <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm">
              <p>
                <span className="text-slate-500">Razão social: </span>
                {readOnly.razao_social ?? "—"}
              </p>
              <p>
                <span className="text-slate-500">Município/UF: </span>
                {readOnly.municipio ?? "—"}/{readOnly.uf ?? "—"}
              </p>
              <p>
                <span className="text-slate-500">Situação: </span>
                {readOnly.situacao_cadastral ?? "—"}
              </p>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">Exibição: {formatCNPJ(cleanCNPJ(cnpj) || cnpj)}</p>
      </div>
    </div>
  );
}

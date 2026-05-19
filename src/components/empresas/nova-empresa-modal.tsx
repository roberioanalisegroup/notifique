"use client";

import { apiJson, apiFetch } from "@/lib/api-client";
import type { Company, CompanyCadastroTipo } from "@/types";
import {
  cadastroTipoLabel,
  canConsultarBrasilApiCnpj,
  cn,
  normalizeDocumentoForTipo,
  onlyDigits,
} from "@/lib/utils";
import { AccessibleModal } from "@/components/ui/accessible-modal";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const TIPOS: CompanyCadastroTipo[] = ["cnpj", "mei", "caepf", "cpf", "outros"];

function maskCnpj14(v: string): string {
  const d = onlyDigits(v).slice(0, 14);
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

function maskCpf11(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let s = p1;
  if (p2) s += "." + p2;
  if (p3) s += "." + p3;
  if (p4) s += "-" + p4;
  return s;
}

type Manual = {
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
};

function emptyManual(): Manual {
  return {
    razao_social: "",
    nome_fantasia: "",
    situacao_cadastral: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    municipio: "",
    uf: "",
    cep: "",
    telefone: "",
    email: "",
  };
}

export function NovaEmpresaModal({ open, onClose, onSaved }: Props) {
  const [cadastroTipo, setCadastroTipo] = useState<CompanyCadastroTipo>("cnpj");
  const [documento, setDocumento] = useState("");
  const [consultarReceita, setConsultarReceita] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [readOnly, setReadOnly] = useState<Company | null>(null);
  const [manual, setManual] = useState<Manual>(emptyManual);
  const [codigoEmpresa, setCodigoEmpresa] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCadastroTipo("cnpj");
      setDocumento("");
      setConsultarReceita(true);
      setReadOnly(null);
      setManual(emptyManual());
      setCodigoEmpresa("");
    }
  }, [open]);

  useEffect(() => {
    if (cadastroTipo !== "cnpj" && cadastroTipo !== "mei") {
      setConsultarReceita(false);
    } else if (cadastroTipo === "cnpj") {
      /* Ao voltar para CNPJ, voltamos ao fluxo padrão: consulta ligada e formulário oculto até desmarcar. */
      setConsultarReceita(true);
    }
    setReadOnly(null);
  }, [cadastroTipo]);

  function setDocMasked(raw: string) {
    if (cadastroTipo === "cpf") setDocumento(maskCpf11(raw));
    else if (cadastroTipo === "outros") setDocumento(onlyDigits(raw).slice(0, 20));
    else setDocumento(maskCnpj14(raw));
  }

  async function onBlurDocumento() {
    const norm = normalizeDocumentoForTipo(cadastroTipo, documento);
    if (!norm.ok) return;
    const podeConsultar =
      cadastroTipo === "mei" || canConsultarBrasilApiCnpj(cadastroTipo, consultarReceita);
    if (!podeConsultar) return;
    if (norm.value.length !== 14) return;

    setSyncing(true);
    setReadOnly(null);
    try {
      const res = await apiFetch("/api/companies/sync-single", {
        method: "POST",
        body: JSON.stringify({ cnpj: norm.value }),
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as {
        company: Company | null;
        error: string | null;
        notFound?: boolean;
      };
      if (!res.ok) {
        if (cadastroTipo === "cnpj") setConsultarReceita(false);
        toast.error(data.error ?? "Não foi possível consultar o CNPJ");
        return;
      }
      if (data.company) {
        setReadOnly(data.company);
        setManual((m) => ({
          ...m,
          razao_social: data.company?.razao_social ?? m.razao_social,
          nome_fantasia: data.company?.nome_fantasia ?? m.nome_fantasia,
          situacao_cadastral: data.company?.situacao_cadastral ?? m.situacao_cadastral,
          logradouro: data.company?.logradouro ?? m.logradouro,
          numero: data.company?.numero ?? m.numero,
          complemento: data.company?.complemento ?? m.complemento,
          bairro: data.company?.bairro ?? m.bairro,
          municipio: data.company?.municipio ?? m.municipio,
          uf: data.company?.uf ?? m.uf,
          cep: data.company?.cep ?? m.cep,
          telefone: data.company?.telefone ?? m.telefone,
          email: data.company?.email ?? m.email,
        }));
        toast.success("Dados carregados da Receita");
      } else {
        if (cadastroTipo === "cnpj") setConsultarReceita(false);
        toast.message("CNPJ não encontrado na Receita", {
          description: "Preencha os dados manualmente abaixo ou ajuste o número.",
        });
      }
    } catch (e) {
      if (cadastroTipo === "cnpj") setConsultarReceita(false);
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncing(false);
    }
  }

  async function onSave() {
    const norm = normalizeDocumentoForTipo(cadastroTipo, documento);
    if (!norm.ok) {
      toast.error(norm.message);
      return;
    }

    if (readOnly?.id) {
      toast.success("Empresa já cadastrada");
      onSaved();
      onClose();
      return;
    }

    setSaving(true);
    try {
      const body = {
        cadastro_tipo: cadastroTipo,
        numero_documento: norm.value,
        sincronizar_receita:
          (cadastroTipo === "mei" ||
            canConsultarBrasilApiCnpj(cadastroTipo, consultarReceita)) &&
          norm.value.length === 14,
        razao_social: manual.razao_social.trim() || readOnly?.razao_social || null,
        nome_fantasia: manual.nome_fantasia.trim() || readOnly?.nome_fantasia || null,
        situacao_cadastral: manual.situacao_cadastral.trim() || readOnly?.situacao_cadastral || null,
        logradouro: manual.logradouro.trim() || readOnly?.logradouro || null,
        numero: manual.numero.trim() || readOnly?.numero || null,
        complemento: manual.complemento.trim() || readOnly?.complemento || null,
        bairro: manual.bairro.trim() || readOnly?.bairro || null,
        municipio: manual.municipio.trim() || readOnly?.municipio || null,
        uf: manual.uf.trim() || readOnly?.uf || null,
        cep: manual.cep.trim() || readOnly?.cep || null,
        telefone: manual.telefone.trim() || readOnly?.telefone || null,
        email: manual.email.trim() || readOnly?.email || null,
        codigo_empresa: codigoEmpresa.trim().slice(0, 80) || null,
      };

      const res = await apiJson<{ company: Company; syncWarning?: string | null }>(
        "/api/companies",
        { method: "POST", body: JSON.stringify(body) }
      );
      if (res.syncWarning) {
        toast.message("Cadastro salvo", { description: res.syncWarning });
      } else {
        toast.success("Empresa salva");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  /** Interruptor “Consultar Receita” só para CNPJ; MEI consulta no blur sem esse controle. */
  const mostrarConsultaReceitaSwitch = cadastroTipo === "cnpj";
  /** Só para CNPJ: com consulta ligada o bloco “Dados cadastrais” fica oculto. */
  const mostrarFormularioManual =
    cadastroTipo !== "cnpj" || !consultarReceita;

  return (
    <AccessibleModal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!saving}
      closeOnEscape={!saving}
      labelledBy="nova-empresa-title"
      panelClassName="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-portal-md dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
    >
        <h2 id="nova-empresa-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">Nova empresa / cadastro</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Escolha o tipo de identificação. <strong className="font-medium text-slate-700 dark:text-slate-300">CNPJ</strong> e{" "}
          <strong className="font-medium text-slate-700 dark:text-slate-300">MEI</strong> podem consultar a BrasilAPI; CAEPF, CPF e
          outros são preenchidos manualmente (ou CNPJ com a consulta desligada).
        </p>

        <div className="mt-5 space-y-4 text-sm">
          <div>
            <label className="form-label" htmlFor="nova-empresa-tipo">
              Tipo de cadastro
            </label>
            <select
              id="nova-empresa-tipo"
              className="select-field mt-1.5"
              value={cadastroTipo}
              onChange={(e) => {
                setCadastroTipo(e.target.value as CompanyCadastroTipo);
                setDocumento("");
                setReadOnly(null);
              }}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {cadastroTipoLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" htmlFor="nova-empresa-codigo">
              Código da empresa (opcional)
            </label>
            <input
              id="nova-empresa-codigo"
              className="input-field mt-1.5 font-mono"
              value={codigoEmpresa}
              onChange={(e) => setCodigoEmpresa(e.target.value.slice(0, 80))}
              placeholder="Ex.: CLI-1024"
              maxLength={80}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Referência interna manual; aparece na listagem e na pesquisa de empresas.
            </p>
          </div>

          {mostrarConsultaReceitaSwitch && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-600 dark:bg-slate-900/70">
              <span className="text-sm text-slate-800 dark:text-slate-200" id="nova-empresa-consulta-label">
                Consultar dados na Receita (BrasilAPI)
              </span>
              <button
                type="button"
                role="switch"
                id="nova-empresa-consulta-switch"
                aria-labelledby="nova-empresa-consulta-label"
                aria-checked={consultarReceita}
                onClick={() => {
                  setConsultarReceita((v) => !v);
                  setReadOnly(null);
                }}
                className={cn(
                  "relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
                  consultarReceita ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-[transform] dark:bg-slate-100",
                    consultarReceita ? "translate-x-6" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
          )}
          {mostrarConsultaReceitaSwitch && !consultarReceita && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Consulta desligada: preencha os dados cadastrais abaixo do documento.
            </p>
          )}
          {cadastroTipo === "mei" && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              MEI: ao sair do campo com 14 dígitos, os dados podem ser buscados na Receita; o formulário abaixo
              permanece disponível para ajustes.
            </p>
          )}

          <div>
            <label className="form-label" htmlFor="nova-empresa-doc">
              {cadastroTipo === "cpf"
                ? "CPF"
                : cadastroTipo === "outros"
                  ? "Identificador (apenas números)"
                  : cadastroTipo === "caepf"
                    ? "CAEPF (14 dígitos)"
                    : "CNPJ"}
            </label>
            <div className="relative mt-1.5">
              <input
                id="nova-empresa-doc"
                className="input-field pr-10"
                value={documento}
                onChange={(e) => setDocMasked(e.target.value)}
                onBlur={onBlurDocumento}
                placeholder={
                  cadastroTipo === "cpf"
                    ? "000.000.000-00"
                    : cadastroTipo === "outros"
                      ? "Mínimo 4 dígitos"
                      : "00.000.000/0000-00"
                }
                autoComplete="off"
              />
              {syncing && (
                <span className="absolute right-3 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-slate-600 dark:border-t-blue-400" />
              )}
            </div>
          </div>

          {readOnly && (cadastroTipo === "mei" || (cadastroTipo === "cnpj" && consultarReceita)) && (
            <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200">
              <p>
                <span className="text-slate-500 dark:text-slate-400">Razão social: </span>
                {readOnly.razao_social ?? "—"}
              </p>
              <p>
                <span className="text-slate-500 dark:text-slate-400">Município/UF: </span>
                {readOnly.municipio ?? "—"}/{readOnly.uf ?? "—"}
              </p>
              <p>
                <span className="text-slate-500 dark:text-slate-400">Situação: </span>
                {readOnly.situacao_cadastral ?? "—"}
              </p>
            </div>
          )}

          {mostrarFormularioManual && (
          <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-700">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Dados cadastrais</p>
              <div>
                <label className="form-label" htmlFor="m-razao">
                  Razão social / nome
                </label>
                <input
                  id="m-razao"
                  className="input-field mt-1.5"
                  value={manual.razao_social}
                  onChange={(e) => setManual((m) => ({ ...m, razao_social: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="m-fantasia">
                  Nome fantasia
                </label>
                <input
                  id="m-fantasia"
                  className="input-field mt-1.5"
                  value={manual.nome_fantasia}
                  onChange={(e) => setManual((m) => ({ ...m, nome_fantasia: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="m-sit">
                  Situação cadastral
                </label>
                <input
                  id="m-sit"
                  className="input-field mt-1.5"
                  value={manual.situacao_cadastral}
                  onChange={(e) => setManual((m) => ({ ...m, situacao_cadastral: e.target.value }))}
                  placeholder="Ex.: ATIVA"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="form-label" htmlFor="m-log">
                    Logradouro
                  </label>
                  <input
                    id="m-log"
                    className="input-field mt-1.5"
                    value={manual.logradouro}
                    onChange={(e) => setManual((m) => ({ ...m, logradouro: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="m-num">
                    Número
                  </label>
                  <input
                    id="m-num"
                    className="input-field mt-1.5"
                    value={manual.numero}
                    onChange={(e) => setManual((m) => ({ ...m, numero: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="m-comp">
                    Complemento
                  </label>
                  <input
                    id="m-comp"
                    className="input-field mt-1.5"
                    value={manual.complemento}
                    onChange={(e) => setManual((m) => ({ ...m, complemento: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="m-bairro">
                    Bairro
                  </label>
                  <input
                    id="m-bairro"
                    className="input-field mt-1.5"
                    value={manual.bairro}
                    onChange={(e) => setManual((m) => ({ ...m, bairro: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="m-mun">
                    Município
                  </label>
                  <input
                    id="m-mun"
                    className="input-field mt-1.5"
                    value={manual.municipio}
                    onChange={(e) => setManual((m) => ({ ...m, municipio: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="m-uf">
                    UF
                  </label>
                  <input
                    id="m-uf"
                    className="input-field mt-1.5"
                    maxLength={2}
                    value={manual.uf}
                    onChange={(e) =>
                      setManual((m) => ({ ...m, uf: e.target.value.toUpperCase().slice(0, 2) }))
                    }
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="m-cep">
                    CEP
                  </label>
                  <input
                    id="m-cep"
                    className="input-field mt-1.5"
                    value={manual.cep}
                    onChange={(e) => setManual((m) => ({ ...m, cep: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="m-tel">
                    Telefone
                  </label>
                  <input
                    id="m-tel"
                    className="input-field mt-1.5"
                    value={manual.telefone}
                    onChange={(e) => setManual((m) => ({ ...m, telefone: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="m-email">
                    E-mail
                  </label>
                  <input
                    id="m-email"
                    type="email"
                    className="input-field mt-1.5"
                    value={manual.email}
                    onChange={(e) => setManual((m) => ({ ...m, email: e.target.value }))}
                  />
                </div>
              </div>
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
    </AccessibleModal>
  );
}

"use client";

import { apiFetch, apiJson } from "@/lib/api-client";
import {
  alvaraNameKey,
  isSemGrupoCell,
  parseFrequenciaCell,
  parseWeekendCell,
} from "@/lib/alvara-import";
import { FREQUENCIA_LABELS } from "@/lib/alvara-frequency";
import { parseCsvBestScore, scoreRowsWithNome, type CsvImportRow } from "@/lib/csv-import";
import type { AlvaraGroup } from "@/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Preview = {
  rows: number;
  withNome: number;
  dupInFile: string[];
  unknownGrupo: number;
  invalidFreq: number;
  emptyWeekendInvalid: number;
};

function cell(row: CsvImportRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

const EXAMPLE_CSV = `nome,grupo,frequencia,ajuste_fim_semana,legal_dia,legal_mes,legal_dia_semana,legal_dias_uteis,descricao,orgao_emissor,ativo
"Licença Sanitária","Área da Saúde",mensal,none,10,,,,,"Vigilância",sim
"AVS sem grupo",,semanal,none,,,1,,,,
"Decendial exemplo","Serviços",decendial,postpone,1,,,5,,,`;

function buildPreview(text: string, groupNames: Set<string>): Preview | null {
  if (!text.trim()) return null;
  const p = parseCsvBestScore(text, scoreRowsWithNome);
  const data = p.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""));
  const seen = new Map<string, string>();
  const dupInFile: string[] = [];
  let withNome = 0;
  let unknownGrupo = 0;
  let invalidFreq = 0;
  let emptyWeekendInvalid = 0;

  for (const row of data) {
    const nome = cell(row, "nome", "name", "alvara", "tipo");
    if (!nome) continue;
    withNome += 1;
    const key = alvaraNameKey(nome);
    if (seen.has(key)) dupInFile.push(nome);
    else seen.set(key, nome);

    const g = cell(row, "grupo", "group", "grupo_nome", "nome_grupo");
    if (!isSemGrupoCell(g) && !groupNames.has(g.trim())) unknownGrupo += 1;

    const fq = cell(row, "frequencia", "freq", "frequência");
    if (!parseFrequenciaCell(fq)) invalidFreq += 1;

    const wk = cell(row, "ajuste_fim_semana", "weekend_adjust", "fim_de_semana", "ajuste");
    if (wk && parseWeekendCell(wk) == null) emptyWeekendInvalid += 1;
  }

  return {
    rows: data.length,
    withNome,
    dupInFile,
    unknownGrupo,
    invalidFreq,
    emptyWeekendInvalid,
  };
}

export default function ImportarAlvarasPage() {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [groupNames, setGroupNames] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    duplicates: number;
    errors: string[];
    errorsTruncated?: boolean;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await apiJson<{ groups: AlvaraGroup[] }>("/api/alvara-groups");
        setGroupNames(new Set(d.groups.map((g) => g.name.trim())));
      } catch {
        setGroupNames(new Set());
      }
    })();
  }, []);

  useEffect(() => {
    if (!csvText) {
      setPreview(null);
      return;
    }
    setPreview(buildPreview(csvText, groupNames));
  }, [csvText, groupNames]);

  const analyzeFile = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setLogLines([]);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
    };
    reader.readAsText(f);
  }, []);

  async function runImport() {
    if (!file) {
      toast.error("Selecione um arquivo");
      return;
    }
    setImporting(true);
    setLogLines([]);
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await apiFetch("/api/alvaras/import", { method: "POST", body: form });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? res.statusText);
      }
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      if (!reader) throw new Error("Resposta vazia");
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const o = JSON.parse(line) as Record<string, unknown>;
            if (o.type === "progress") {
              setLogLines((prev) => [
                ...prev,
                `(${o.index}/${o.total}) ${String(o.name)} — ${o.ok ? "ok" : "falha: " + String(o.detail ?? "")}`,
              ]);
            }
            if (o.type === "done") {
              setResult({
                imported: Number(o.imported ?? 0),
                skipped: Number(o.skipped ?? 0),
                duplicates: Number(o.duplicates ?? 0),
                errors: (o.errors as string[]) ?? [],
                errorsTruncated: Boolean(o.errorsTruncated),
              });
            }
          } catch {
            // ignore
          }
        }
      }
      if (buffer.trim()) {
        try {
          const o = JSON.parse(buffer) as {
            type?: string;
            imported?: number;
            skipped?: number;
            duplicates?: number;
            errors?: string[];
            errorsTruncated?: boolean;
          };
          if (o.type === "done" && o.imported != null) {
            setResult({
              imported: o.imported,
              skipped: o.skipped ?? 0,
              duplicates: o.duplicates ?? 0,
              errors: o.errors ?? [],
              errorsTruncated: o.errorsTruncated,
            });
          }
        } catch {
          // ignore
        }
      }
      toast.success("Importação concluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na importação");
    } finally {
      setImporting(false);
    }
  }

  const freqList = Object.entries(FREQUENCIA_LABELS)
    .map(([slug, label]) => `${slug} / ${label}`)
    .join(", ");

  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div>
        <Link href="/portal/alvaras" className="text-sm font-medium text-blue-600 hover:text-blue-700">
          ← Voltar aos tipos de alvará
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Importar tipos de alvará (CSV)</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Apenas grupos já cadastrados (nome idêntico) ou linha sem grupo / “Sem grupo”. Nomes de alvará não podem
          repetir os já existentes nem duplicar no arquivo. Frequência e data legal seguem as mesmas regras do
          cadastro manual.
        </p>
      </div>

      <div className="card-portal p-4 sm:p-5">
        <p className="form-label mb-2">Colunas (cabeçalhos em minúsculas)</p>
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
          <li>
            <strong>nome</strong> (obrigatório)
          </li>
          <li>
            <strong>grupo</strong> — vazio, “Sem grupo” ou nome <strong>exatamente igual</strong> ao grupo no sistema
          </li>
          <li>
            <strong>frequencia</strong> — slug ou rótulo: {freqList}
          </li>
          <li>
            <strong>ajuste_fim_semana</strong> — <code className="rounded bg-slate-100 px-1">none</code>,{" "}
            <code className="rounded bg-slate-100 px-1">postpone</code>,{" "}
            <code className="rounded bg-slate-100 px-1">anticipate</code> (ou texto com postergar/antecipar); vazio =
            none
          </li>
          <li>
            <strong>legal_dia</strong>, <strong>legal_mes</strong>, <strong>legal_dia_semana</strong>,{" "}
            <strong>legal_dias_uteis</strong> — conforme a frequência (valores padrão se omitidos: dia 1, mês 1, segunda,
            5 úteis no decendial)
          </li>
          <li>
            <strong>descricao</strong>, <strong>orgao_emissor</strong>, <strong>ativo</strong> (sim/não, opcional)
          </li>
        </ul>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(EXAMPLE_CSV)}`}
          download="exemplo-alvaras.csv"
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Baixar CSV de exemplo
        </a>
      </div>

      <div
        className="card-portal flex min-h-40 items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50/30 p-6 text-center"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) analyzeFile(f);
        }}
      >
        <div>
          <p className="text-sm text-slate-600">Arraste o CSV aqui ou selecione o arquivo</p>
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-500"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) analyzeFile(f);
            }}
          />
          {file && <p className="mt-2 text-sm font-medium text-slate-900">Arquivo: {file.name}</p>}
        </div>
      </div>

      {preview && (
        <div className="card-portal space-y-2 p-4 text-sm text-slate-700 sm:p-5">
          <p>
            Linhas com dados: {preview.rows} · Com nome: {preview.withNome}
          </p>
          {preview.dupInFile.length > 0 && (
            <p className="text-amber-800">
              Nomes repetidos no arquivo: {preview.dupInFile.slice(0, 8).join(", ")}
              {preview.dupInFile.length > 8 ? "…" : ""}
            </p>
          )}
          {preview.unknownGrupo > 0 && (
            <p className="text-amber-800">
              {preview.unknownGrupo} linha(s) com grupo que não bate com o cadastro (nome deve ser idêntico).
            </p>
          )}
          {preview.invalidFreq > 0 && (
            <p className="text-amber-800">{preview.invalidFreq} linha(s) com frequência inválida ou vazia.</p>
          )}
          {preview.emptyWeekendInvalid > 0 && (
            <p className="text-amber-800">
              {preview.emptyWeekendInvalid} linha(s) com ajuste de fim de semana não reconhecido.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={runImport}
        disabled={importing || !file}
        className="btn-primary disabled:opacity-50"
      >
        {importing ? "Importando…" : "Confirmar importação"}
      </button>

      {logLines.length > 0 && (
        <div className="card-portal max-h-64 overflow-y-auto p-3 font-mono text-xs text-slate-700">
          {logLines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}

      {result && (
        <div className="card-portal border-green-200 bg-green-50/80 p-4 text-sm text-green-900">
          <p>
            Inseridos: {result.imported} · Ignorados (erro de validação): {result.skipped} · Duplicados de nome:{" "}
            {result.duplicates}
          </p>
          {result.errorsTruncated ? (
            <p className="mt-2 text-amber-900">Lista de erros truncada (primeiros 50).</p>
          ) : null}
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-4 text-red-700">
              {result.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

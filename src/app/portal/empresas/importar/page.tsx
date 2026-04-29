"use client";

import { apiFetch } from "@/lib/api-client";
import {
  extractCnpjFromRow,
  extractCodigoEmpresaFromRow,
  parseCsvBestScore,
  scoreRowsWithValidCnpj,
} from "@/lib/csv-import";
import { cleanCNPJ } from "@/lib/utils";
import Link from "next/link";
import { useState, useCallback } from "react";
import { toast } from "sonner";

type Preview = { valid: string[]; invalid: string[]; rows: number; comCodigo: number };

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [result, setResult] = useState<{
    imported: number;
    duplicates: number;
    errorMessages: string[];
  } | null>(null);

  const onDrop = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setLogLines([]);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const p = parseCsvBestScore(text, scoreRowsWithValidCnpj);
      const valid: string[] = [];
      const invalid: string[] = [];
      const seen = new Set<string>();
      let comCodigo = 0;
      for (const row of p.data) {
        const raw = extractCnpjFromRow(row);
        if (!raw) continue;
        const c = cleanCNPJ(raw);
        if (c.length === 14) {
          if (!seen.has(c)) {
            seen.add(c);
            valid.push(c);
            if (extractCodigoEmpresaFromRow(row).trim() !== "") {
              comCodigo += 1;
            }
          }
        } else {
          invalid.push(raw);
        }
      }
      setPreview({ valid, invalid, rows: p.data.length, comCodigo });
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
      const res = await apiFetch("/api/companies/import", { method: "POST", body: form });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: string[];
          delimiter?: string | null;
        };
        const base = j.error ?? res.statusText;
        const extra =
          j.details?.length || j.delimiter != null
            ? ` ${[j.details?.length ? j.details.join(" · ") : "", j.delimiter != null ? `(delimitador: ${j.delimiter})` : ""].filter(Boolean).join(" ")}`
            : "";
        throw new Error(base + extra);
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
                `(${o.index}/${o.total}) ${String(o.cnpj)} — ${o.ok ? "ok" : "falha"}`,
              ]);
            }
            if (o.type === "done") {
              setResult({
                imported: Number(o.imported ?? 0),
                duplicates: Number(o.duplicates ?? 0),
                errorMessages: (o.errorMessages as string[]) ?? [],
              });
            }
          } catch {
            // ignore bad line
          }
        }
      }
      if (buffer.trim()) {
        try {
          const o = JSON.parse(buffer) as {
            type?: string;
            imported?: number;
            duplicates?: number;
            errorMessages?: string[];
          };
          if (o.type === "done" && o.imported != null) {
            setResult({
              imported: o.imported,
              duplicates: o.duplicates ?? 0,
              errorMessages: o.errorMessages ?? [],
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

  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div>
        <Link
          href="/portal/empresas"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Empresas
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Importar empresas (CSV)</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Coluna obrigatória:{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">cnpj</code>. Opcional:{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">codigo_empresa</code> (pode
          ficar vazio para preencher depois no perfil).
        </p>
      </div>

      <div className="card-portal p-4 sm:p-5">
        <p className="form-label mb-2">Formato esperado</p>
        <pre className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 font-mono text-xs text-slate-800">
          {`cnpj,codigo_empresa
12.345.678/0001-90,LOJA-01
98.765.432/0001-10,`}
        </pre>
        <a
          href="data:text/csv;charset=utf-8,cnpj%2Ccodigo_empresa%0A00.000.000%2F0001-91%2C%0A"
          download="exemplo-empresas.csv"
          className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
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
          onDrop(f);
        }}
      >
        <div>
          <p className="text-sm text-slate-600">Arraste o CSV aqui ou selecione o arquivo</p>
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-500"
            onChange={(e) => onDrop(e.target.files?.[0] ?? null)}
          />
          {file && <p className="mt-2 text-sm font-medium text-slate-900">Arquivo: {file.name}</p>}
        </div>
      </div>

      {preview && (
        <div className="card-portal p-4 text-sm text-slate-700 sm:p-5">
          <p>
            Linhas: {preview.rows} · CNPJs únicos válidos: {preview.valid.length} · Com código no
            ficheiro: {preview.comCodigo} · Inválidos: {preview.invalid.length}
          </p>
          {preview.invalid.length > 0 && (
            <p className="mt-2 text-amber-800">
              Inválidos: {preview.invalid.slice(0, 5).join(", ")}
              {preview.invalid.length > 5 ? "…" : ""}
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
            Inseridos: {result.imported} · Duplicatas: {result.duplicates}
          </p>
          {result.errorMessages.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-red-700">
              {result.errorMessages.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

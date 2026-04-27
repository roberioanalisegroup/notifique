import { getSupabaseForRequest } from "@/lib/api-auth";
import { CNPJ_BATCH_DELAY_MS, sleep } from "@/lib/cnpj-service";
import {
  extractCnpjFromRow,
  parseCsvBestScore,
  scoreRowsWithValidCnpj,
  stripBomAndNormalizeNewlines,
  type CsvImportRow,
} from "@/lib/csv-import";
import { upsertCompanyByCNPJ } from "@/lib/sync-helpers";
import { cleanCNPJ } from "@/lib/utils";
import { NextRequest } from "next/server";

type ImportRow = CsvImportRow;

export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const form = await request.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: "Arquivo (file) é obrigatório" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const text = await file.text();
  const parsed = parseCsvBestScore(text, scoreRowsWithValidCnpj);

  const seen = new Set<string>();
  const cnpjList: string[] = [];
  const invalid: string[] = [];

  for (const row of parsed.data) {
    const raw = extractCnpjFromRow(row);
    if (!raw) continue;
    const c = cleanCNPJ(raw);
    if (c.length !== 14) {
      invalid.push(raw);
      continue;
    }
    if (seen.has(c)) continue;
    seen.add(c);
    cnpjList.push(c);
  }

  const trimmed = stripBomAndNormalizeNewlines(text).trim();
  if (cnpjList.length === 0 && trimmed.length > 0) {
    return new Response(
      JSON.stringify({
        error:
          "Nenhum CNPJ válido (14 dígitos) encontrado. Confira a coluna \"cnpj\", o separador (; ou ,) e se o arquivo está em UTF-8.",
        details: parsed.errors.map(
          (e) => `${e.type} (${e.code}): ${e.message}` + (e.row != null ? ` — linha ${e.row}` : "")
        ),
        delimiter: parsed.meta?.delimiter ?? null,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      const companiesOut: { id: string; cnpj: string }[] = [];
      let inserted = 0;
      let duplicates = 0;
      const errors: string[] = [];

      for (const cnpj of cnpjList) {
        const { data: existing } = await supabase
          .from("companies")
          .select("id, numero_documento")
          .eq("numero_documento", cnpj)
          .maybeSingle();

        if (existing) {
          duplicates += 1;
        } else {
          const { data: ins, error: insErr } = await supabase
            .from("companies")
            .insert({
              cadastro_tipo: "cnpj",
              numero_documento: cnpj,
              cnpj,
              sync_status: "pending",
            })
            .select("id, cnpj")
            .single();

          if (insErr) {
            if (insErr.message.includes("duplicate") || insErr.code === "23505") {
              duplicates += 1;
            } else {
              errors.push(`${cnpj}: ${insErr.message}`);
            }
            continue;
          }
          inserted += 1;
          if (ins) companiesOut.push(ins as { id: string; cnpj: string });
        }
      }

      const toSync = cnpjList;
      for (let i = 0; i < toSync.length; i++) {
        if (i > 0) await sleep(CNPJ_BATCH_DELAY_MS);
        const cnpj = toSync[i];
        const { company, error } = await upsertCompanyByCNPJ(supabase, cnpj);
        send({
          type: "progress",
          index: i + 1,
          total: toSync.length,
          cnpj,
          ok: !error,
          error: error ?? null,
          company: company
            ? { id: company.id, cnpj: company.cnpj, razao_social: company.razao_social }
            : null,
        });
      }

      send({
        type: "done",
        imported: inserted,
        duplicates,
        errors: errors.length,
        errorMessages: errors,
        companies: companiesOut,
        invalid,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

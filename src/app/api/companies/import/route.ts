import { getSupabaseForRequest } from "@/lib/api-auth";
import { insertAuditLog } from "@/lib/audit-log";
import { CNPJ_BATCH_DELAY_MS, sleep } from "@/lib/cnpj-service";
import {
  extractCnpjFromRow,
  extractCodigoEmpresaFromRow,
  parseCsvBestScore,
  scoreRowsWithValidCnpj,
  stripBomAndNormalizeNewlines,
} from "@/lib/csv-import";
import { upsertCompanyByCNPJ } from "@/lib/sync-helpers";
import { cleanCNPJ } from "@/lib/utils";
import { NextRequest } from "next/server";

type ImportPair = { cnpj: string; codigo_empresa: string | null };

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Set([
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel", // alguns browsers
]);

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

  if (typeof file.size === "number" && file.size > MAX_CSV_BYTES) {
    void insertAuditLog(supabase, {
      event_type: "csv_import_rejected",
      actor_user_id: auth.isServiceRole ? null : auth.userId,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: request.headers.get("user-agent"),
      metadata: { reason: "file_too_large", size: file.size, max: MAX_CSV_BYTES },
    });
    return new Response(
      JSON.stringify({
        error: `Arquivo muito grande. Máximo permitido: ${Math.floor(MAX_CSV_BYTES / (1024 * 1024))}MB.`,
      }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    );
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    void insertAuditLog(supabase, {
      event_type: "csv_import_rejected",
      actor_user_id: auth.isServiceRole ? null : auth.userId,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: request.headers.get("user-agent"),
      metadata: { reason: "invalid_mime", mime: file.type },
    });
    return new Response(
      JSON.stringify({
        error: `Tipo de arquivo não permitido (${file.type}). Envie um CSV.`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const text = await file.text();
  const parsed = parseCsvBestScore(text, scoreRowsWithValidCnpj);

  const seen = new Set<string>();
  const pairs: ImportPair[] = [];
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
    const codRaw = extractCodigoEmpresaFromRow(row);
    const codigo_empresa = codRaw.trim() === "" ? null : codRaw.trim().slice(0, 80);
    pairs.push({ cnpj: c, codigo_empresa });
  }

  const trimmed = stripBomAndNormalizeNewlines(text).trim();
  if (pairs.length === 0 && trimmed.length > 0) {
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

      for (const { cnpj, codigo_empresa } of pairs) {
        const { data: existing } = await supabase
          .from("companies")
          .select("id, numero_documento")
          .eq("numero_documento", cnpj)
          .maybeSingle();

        if (existing) {
          duplicates += 1;
        } else {
          const insertRow: Record<string, unknown> = {
            user_id: auth.userId,
            cadastro_tipo: "cnpj",
            numero_documento: cnpj,
            cnpj,
            sync_status: "pending",
          };
          if (codigo_empresa != null) {
            insertRow.codigo_empresa = codigo_empresa;
          }

          const { data: ins, error: insErr } = await supabase
            .from("companies")
            .insert(insertRow)
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

      const toSync = pairs.map((p) => p.cnpj);
      for (let i = 0; i < toSync.length; i++) {
        if (i > 0) await sleep(CNPJ_BATCH_DELAY_MS);
        const cnpj = toSync[i];
        const { company, error } = await upsertCompanyByCNPJ(supabase, cnpj, {
          userId: auth.userId,
        });
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

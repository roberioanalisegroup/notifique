import { getSupabaseForRequest } from "@/lib/api-auth";
import { CNPJ_BATCH_DELAY_MS, sleep } from "@/lib/cnpj-service";
import {
  fetchCompaniesForSync,
  upsertCompanyByCNPJ,
  SYNC_CONFIG_ID,
} from "@/lib/sync-helpers";
import type { SyncConfig } from "@/types";
import { NextRequest, NextResponse } from "next/server";

/** Vercel / plataformas: aumenta o tempo máximo (segundos). Localmente ignora. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function getSyncMaxCompanies(): number {
  const raw = process.env.SYNC_MAX_COMPANIES;
  if (raw == null || raw === "") return 3000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50_000) : 3000;
}

export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request, { allowServiceRole: true });
  if ("error" in auth) return auth.error;
  const { supabase, isServiceRole, userId } = auth;
  if (!isServiceRole && !userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
  }

  const { data: configRow, error: configErr } = await supabase
    .from("sync_config")
    .select("*")
    .eq("id", SYNC_CONFIG_ID)
    .single();

  if (configErr) {
    return NextResponse.json(
      { error: "Não foi possível carregar a configuração" },
      { status: 500 }
    );
  }

  const config = configRow as SyncConfig;
  if (isServiceRole && !config.sync_enabled) {
    return NextResponse.json({
      total: 0,
      success: 0,
      errors: 0,
      skipped: 0,
      message: "Sincronização automática desativada (cron)",
    });
  }

  const all = await fetchCompaniesForSync(supabase, config);
  const cap = getSyncMaxCompanies();
  const totalQueued = all.length;
  const capped = totalQueued > cap;
  const companies = capped ? all.slice(0, cap) : all;

  const logNotes = [
    isServiceRole ? "Disparado por cron (service role)" : "Sincronização manual",
    capped ? `Limite de ${cap} empresas por pedido (definir SYNC_MAX_COMPANIES).` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { data: logInsert, error: logErr } = await supabase
    .from("sync_logs")
    .insert({
      total: companies.length,
      success: 0,
      errors: 0,
      skipped: 0,
      triggered_by: isServiceRole ? "cron" : "manual",
      notes: logNotes,
    })
    .select("id")
    .single();

  if (logErr || !logInsert) {
    return NextResponse.json(
      { error: "Não foi possível criar o log" },
      { status: 500 }
    );
  }

  const logId = logInsert.id as string;
  let success = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    if (i > 0) await sleep(CNPJ_BATCH_DELAY_MS);
    const { error } = await upsertCompanyByCNPJ(supabase, c.cnpj);
    if (error) {
      if (error === "Rate limit atingido") {
        skipped += 1;
      } else {
        errors += 1;
      }
    } else {
      success += 1;
    }
  }

  await supabase
    .from("sync_logs")
    .update({
      finished_at: new Date().toISOString(),
      total: companies.length,
      success,
      errors,
      skipped,
    })
    .eq("id", logId);

  return NextResponse.json({
    total: companies.length,
    total_queued: totalQueued,
    cap,
    cap_applied: capped,
    success,
    errors,
    skipped,
  });
}

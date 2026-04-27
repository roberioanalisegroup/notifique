import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  janelaAPartirDe,
  listVencimentosNaJanela,
  mergeVencComCampoBanco,
} from "@/lib/alvara-task-generation";
import type { Alvara, Company, CompanyAlvara } from "@/types";
import { NextRequest, NextResponse } from "next/server";

type CaRow = CompanyAlvara & { alvaras: Alvara | null };

function isPgUniqueViolation(err: { code?: string; message?: string } | null) {
  return err?.code === "23505" || (err?.message?.toLowerCase().includes("duplicate") ?? false);
}

/** Lista tarefas com vínculo, empresa e tipo de alvará. */
export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");

  let q = supabase
    .from("alvara_tasks")
    .select(
      `
      *,
      company_alvaras (
        *,
        companies ( id, cnpj, razao_social, nome_fantasia, situacao_cadastral, municipio, uf ),
        alvaras ( *, alvara_groups ( id, name, color ) )
      )
    `
    )
    .order("due_date", { ascending: true, nullsFirst: false });

  if (status) {
    q = q.eq("status", status);
  }
  if (from) {
    q = q.gte("due_date", from);
  }
  if (to) {
    q = q.lte("due_date", to);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message, tasks: [] }, { status: 500 });
  }
  return NextResponse.json({ tasks: data });
}

/**
 * Gera tarefas na janela (padrão: hoje → hoje+30 dias, alinhado ao painel de stats).
 * Idempotente: ignora conflito por (company_alvara_id, due_date).
 */
export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: { offsetDias?: number } = {};
  try {
    const t = await request.text();
    if (t) body = JSON.parse(t) as { offsetDias?: number };
  } catch {
    body = {};
  }

  const offsetDias = Math.min(366, Math.max(7, Number(body.offsetDias) || 30));
  const { inicio, fim } = janelaAPartirDe(new Date(), offsetDias);

  const { data: vinculos, error: e1 } = await supabase
    .from("company_alvaras")
    .select(
      `
      id,
      data_emissao,
      data_vencimento,
      alvaras ( * )
    `
    );
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }

  const rows = (vinculos ?? []) as unknown as CaRow[];
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const ca of rows) {
    const a = ca.alvaras;
    if (!a?.is_active) {
      continue;
    }

    let vencs = listVencimentosNaJanela(a, ca.data_emissao, inicio, fim);
    vencs = mergeVencComCampoBanco(vencs, ca.data_vencimento, inicio, fim);
    for (const due of vencs) {
      const { error: e2 } = await supabase.from("alvara_tasks").insert({
        company_alvara_id: ca.id,
        due_date: due,
        status: "pendente",
        title: null,
      });
      if (e2) {
        if (isPgUniqueViolation(e2)) {
          skipped++;
        } else {
          if (errors.length < 5) {
            errors.push(e2.message);
          }
        }
      } else {
        inserted++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    janela: { inicio, fim, offsetDias },
    inseridos: inserted,
    ignoradosDuplicata: skipped,
    erros: errors.length > 0 ? errors : undefined,
  });
}

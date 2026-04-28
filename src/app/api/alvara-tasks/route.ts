import { getSupabaseForRequest } from "@/lib/api-auth";
import { inicioObrigatorioAteFromCriacao } from "@/lib/alvara-task-generation";
import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

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
    .order("due_date", { ascending: true, nullsFirst: true });

  if (status) {
    q = q.eq("status", status);
  }
  if (from && to) {
    q = q.or(`due_date.is.null,and(due_date.gte.${from},due_date.lte.${to})`);
  } else if (from) {
    q = q.or(`due_date.is.null,due_date.gte.${from}`);
  } else if (to) {
    q = q.or(`due_date.is.null,due_date.lte.${to}`);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message, tasks: [] }, { status: 500 });
  }
  return NextResponse.json({ tasks: data });
}

/**
 * Garante uma tarefa pendente por vínculo (tipo ativo). Sem vencimento até registo da emissão;
 * no 1.º ciclo define `inicio_obrigatorio_ate` (criação + prazo_inicio_dias do tipo).
 */
export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  try {
    const t = await request.text();
    if (t) JSON.parse(t);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { data: vinculos, error: e1 } = await supabase
    .from("company_alvaras")
    .select(
      `
      id,
      alvaras ( id, is_active, prazo_inicio_dias )
    `
    );
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }

  const rows = (vinculos ?? []) as unknown as {
    id: string;
    alvaras: { id: string; is_active: boolean; prazo_inicio_dias?: number | null } | null;
  }[];
  const { data: pendentes, error: eP } = await supabase
    .from("alvara_tasks")
    .select("company_alvara_id")
    .eq("status", "pendente");

  if (eP) {
    return NextResponse.json({ error: eP.message }, { status: 500 });
  }

  const comPendente = new Set((pendentes ?? []).map((r) => r.company_alvara_id as string));
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const ca of rows) {
    const a = ca.alvaras;
    if (!a?.is_active) continue;
    if (comPendente.has(ca.id)) {
      skipped++;
      continue;
    }

    const baseDia = format(new Date(), "yyyy-MM-dd");
    const prazoDias = Math.min(
      3650,
      Math.max(1, Number(a.prazo_inicio_dias ?? 30) || 30)
    );
    const inicioOb = inicioObrigatorioAteFromCriacao(baseDia, prazoDias);

    const { error: e2 } = await supabase.from("alvara_tasks").insert({
      company_alvara_id: ca.id,
      due_date: null,
      inicio_obrigatorio_ate: inicioOb,
      status: "pendente",
      title: null,
    });

    if (e2) {
      if (isPgUniqueViolation(e2)) {
        skipped++;
      } else {
        if (errors.length < 5) errors.push(e2.message);
      }
    } else {
      inserted++;
      comPendente.add(ca.id);
    }
  }

  return NextResponse.json({
    ok: true,
    inseridos: inserted,
    ignoradosJaComPendente: skipped,
    erros: errors.length > 0 ? errors : undefined,
  });
}

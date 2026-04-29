import { getSupabaseForRequest } from "@/lib/api-auth";
import { endOfMonth, startOfMonth } from "date-fns";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const now = new Date();
  const monthStart = startOfMonth(now).toISOString().slice(0, 10);
  const monthEnd = endOfMonth(now).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  const until = in30.toISOString().slice(0, 10);

  const [r0, r1, r2, r3, r4, r5] = await Promise.all([
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .ilike("situacao_cadastral", "ATIVA"),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .eq("sync_status", "pending"),
    supabase.from("alvaras").select("id", { count: "exact", head: true }),
    supabase
      .from("company_alvaras")
      .select("id", { count: "exact", head: true })
      .lt("data_vencimento", today)
      .not("data_vencimento", "is", null),
    supabase
      .from("company_alvaras")
      .select("id", { count: "exact", head: true })
      .gte("data_notificacao", monthStart)
      .lte("data_notificacao", monthEnd)
      .not("data_notificacao", "is", null),
  ]);

  const totalEmpresas = r0.count;
  const ativas = r1.count;
  const syncPending = r2.count;
  const totalAlvarasTipos = r3.count;
  const vencidos = r4.count;
  const notifCount = r5.count;

  const { data: vencendo } = await supabase
    .from("company_alvaras")
    .select(
      `
      id,
      numero,
      data_vencimento,
      status,
      companies!inner ( id, cnpj, razao_social, nome_fantasia ),
      alvaras ( id, name, group_id )
    `
    )
    .is("companies.archived_at", null)
    .not("data_vencimento", "is", null)
    .gte("data_vencimento", today)
    .lte("data_vencimento", until)
    .order("data_vencimento", { ascending: true })
    .limit(50);

  return NextResponse.json({
    kpis: {
      totalEmpresas: totalEmpresas ?? 0,
      ativas: ativas ?? 0,
      syncPendentes: syncPending ?? 0,
      totalAlvaras: totalAlvarasTipos ?? 0,
      alvarasVencidos: vencidos ?? 0,
      notificacoesNoMes: notifCount ?? 0,
    },
    vencendoProx30Dias: vencendo ?? [],
  });
}

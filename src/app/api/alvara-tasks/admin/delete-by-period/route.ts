import { resetCompanyAlvaraIfNoActiveTasks } from "@/lib/alvara-task-vinculo-reset";
import { getSupabaseForRequest } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { verifyUserPasswordMatchesSession } from "@/lib/verify-user-password";
import { NextRequest, NextResponse } from "next/server";

type Body = {
  from?: string;
  to?: string;
  password?: string;
};

/**
 * Elimina todas as tarefas cuja data de vencimento (due_date) está no período,
 * independentemente do estado ou alterações. Exige confirmação com palavra-passe.
 */
export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.isServiceRole) {
    return NextResponse.json(
      { error: "Esta operação exige sessão de utilizador e confirmação por palavra-passe." },
      { status: 403 }
    );
  }
  const { supabase, userId } = auth;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const from = body.from?.trim();
  const to = body.to?.trim();
  const password = body.password ?? "";

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { error: "Informe from e to no formato YYYY-MM-DD." },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json({ error: "Data inicial não pode ser posterior à final." }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "Palavra-passe obrigatória." }, { status: 400 });
  }

  const serverAuth = await createClient();
  const {
    data: { user },
    error: uErr,
  } = await serverAuth.auth.getUser();
  if (uErr || !user?.email) {
    return NextResponse.json({ error: "Não foi possível validar o utilizador." }, { status: 401 });
  }

  const v = await verifyUserPasswordMatchesSession(user.email, password, userId);
  if (!v.ok) {
    return NextResponse.json({ error: v.message }, { status: 401 });
  }

  const { data: toDelete, error: qErr } = await supabase
    .from("alvara_tasks")
    .select("id, company_alvara_id")
    .gte("due_date", from)
    .lte("due_date", to);

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const delIds = (toDelete ?? []).map((r) => r.id as string);
  const caIdsParaReset = Array.from(
    new Set((toDelete ?? []).map((r) => String(r.company_alvara_id)))
  );
  if (delIds.length === 0) {
    return NextResponse.json({ deleted: 0, message: "Nenhuma tarefa no período." });
  }

  const { error: dErr } = await supabase.from("alvara_tasks").delete().in("id", delIds);
  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  let vinculosLimpos = 0;
  for (const caId of caIdsParaReset) {
    try {
      const r = await resetCompanyAlvaraIfNoActiveTasks(supabase, caId);
      if (r.reset) vinculosLimpos++;
    } catch {
      /* não bloqueia */
    }
  }

  return NextResponse.json({
    ok: true,
    deleted: delIds.length,
    intervalo: { from, to },
    vinculos_datas_limpos: vinculosLimpos,
  });
}

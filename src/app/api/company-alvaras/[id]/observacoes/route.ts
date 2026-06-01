import { getSupabaseForRequest } from "@/lib/api-auth";
import { logCompanyHistory } from "@/lib/company-history";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  // 1. Fetch user role and verify authorization
  const { data: meProf } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = meProf?.role || "user";
  const isAdminOrGestor = role === "admin" || role === "gestor";

  if (!isAdminOrGestor) {
    return NextResponse.json(
      { error: "Permissão negada. Apenas administradores ou gestores podem editar observações." },
      { status: 403 }
    );
  }

  // 2. Parse request body
  let body: { observacoes?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!Object.prototype.hasOwnProperty.call(body, "observacoes")) {
    return NextResponse.json(
      { error: "O campo 'observacoes' é obrigatório no payload." },
      { status: 400 }
    );
  }

  const newObservacoes = body.observacoes ?? null;

  // 3. Get existing company_alvara details for history logging
  const { data: beforeRow, error: selErr } = await supabase
    .from("company_alvaras")
    .select(`
      company_id,
      observacoes,
      alvaras ( name )
    `)
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!beforeRow) {
    return NextResponse.json({ error: "Vínculo de alvará não encontrado" }, { status: 404 });
  }

  // 4. Perform update
  const { data, error } = await supabase
    .from("company_alvaras")
    .update({ observacoes: newObservacoes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 5. Log semantic company history event
  const companyId = beforeRow.company_id;
  const alvaraNome = (beforeRow as any).alvaras?.name || "Alvará";

  await logCompanyHistory(supabase, {
    companyId,
    eventType: "company_alvara_observations_updated",
    summary: `Observações atualizadas (${alvaraNome}).`,
    metadata: {
      company_alvara_id: id,
      previous_observacoes: beforeRow.observacoes,
      new_observacoes: newObservacoes,
    },
    actorUserId: userId,
  });

  return NextResponse.json({ company_alvara: data });
}

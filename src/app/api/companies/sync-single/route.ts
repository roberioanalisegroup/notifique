import { getSupabaseForRequest } from "@/lib/api-auth";
import { logCompanyHistory } from "@/lib/company-history";
import { upsertCompanyByCNPJ } from "@/lib/sync-helpers";
import { onlyDigits } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: { cnpj?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const cnpj = body.cnpj;
  if (!cnpj || typeof cnpj !== "string") {
    return NextResponse.json({ error: "cnpj é obrigatório" }, { status: 400 });
  }

  const { company, error, notFound } = await upsertCompanyByCNPJ(supabase, cnpj);
  if (error && !company) {
    return NextResponse.json(
      { error, notFound, company: null },
      { status: notFound ? 404 : 502 }
    );
  }

  if (company?.id) {
    const actorUserId = auth.isServiceRole ? null : auth.userId;
    await logCompanyHistory(supabase, {
      companyId: company.id,
      eventType: "cadastro_sync",
      summary: "Dados do cadastro atualizados a partir da Receita Federal (BrasilAPI).",
      metadata: { cnpj: onlyDigits(cnpj) },
      actorUserId,
    });
  }

  return NextResponse.json({ company, error: null, notFound: false });
}

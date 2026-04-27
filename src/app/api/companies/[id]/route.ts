import { getSupabaseForRequest } from "@/lib/api-auth";
import type { Alvara, AlvaraGroup, Company, CompanyAlvara } from "@/types";
import { NextRequest, NextResponse } from "next/server";

type Row = CompanyAlvara & {
  alvaras: Alvara & { alvara_groups: AlvaraGroup };
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getSupabaseForRequest(_request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", params.id)
    .single();

  if (cErr || !company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  const { data: links, error: lErr } = await supabase
    .from("company_alvaras")
    .select(
      `
      *,
      alvaras (
        *,
        alvara_groups (*)
      )
    `
    )
    .eq("company_id", params.id)
    .order("data_vencimento", { ascending: true, nullsFirst: false });

  if (lErr) {
    return NextResponse.json(
      { error: lErr.message, company, company_alvaras: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({
    company: company as Company,
    company_alvaras: (links ?? []) as unknown as Row[],
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { error } = await supabase.from("companies").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

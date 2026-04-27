import { getSupabaseForRequest } from "@/lib/api-auth";
import type { CompanyFilterOptions } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("companies")
    .select("uf, municipio, situacao_cadastral");

  if (error) {
    const empty: CompanyFilterOptions = { ufs: [], citiesByUf: {}, situacoes: [] };
    return NextResponse.json({ error: error.message, ...empty }, { status: 500 });
  }

  const citiesByUf = new Map<string, Set<string>>();
  const ufs = new Set<string>();
  const situacoes = new Set<string>();

  for (const row of data ?? []) {
    const uf = row.uf?.trim();
    const mun = row.municipio?.trim();
    const sit = row.situacao_cadastral?.trim();
    if (uf) {
      ufs.add(uf);
      if (mun) {
        if (!citiesByUf.has(uf)) citiesByUf.set(uf, new Set());
        citiesByUf.get(uf)!.add(mun);
      }
    }
    if (sit) situacoes.add(sit);
  }

  const ufsSorted = Array.from(ufs).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const citiesByUfObj: Record<string, string[]> = {};
  for (const u of ufsSorted) {
    const set = citiesByUf.get(u);
    citiesByUfObj[u] = set
      ? Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"))
      : [];
  }

  const situacoesSorted = Array.from(situacoes).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const body: CompanyFilterOptions = {
    ufs: ufsSorted,
    citiesByUf: citiesByUfObj,
    situacoes: situacoesSorted,
  };

  return NextResponse.json(body);
}

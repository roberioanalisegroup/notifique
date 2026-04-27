import { getSupabaseForRequest } from "@/lib/api-auth";
import { cleanCNPJ } from "@/lib/utils";
import type { Company } from "@/types";
import { NextRequest, NextResponse } from "next/server";

function parseParam(sp: string | null, def: number, min: number, max: number) {
  const n = sp ? parseInt(sp, 10) : def;
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function GET(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = request.nextUrl;
  const page = parseParam(searchParams.get("page"), 1, 1, 100_000);
  const limit = parseParam(searchParams.get("limit"), 20, 1, 100);
  const search = (searchParams.get("search") ?? "").trim();
  const situacao = searchParams.get("situacao");
  const municipios = searchParams
    .getAll("municipio")
    .map((m) => m.trim())
    .filter(Boolean);
  const sync_status = searchParams.get("sync_status");
  const uf = searchParams.get("uf")?.trim() || null;

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from("companies_alvara_summary")
    .select("*", { count: "exact" });

  if (search) {
    const cnpjDigits = cleanCNPJ(search);
    if (cnpjDigits.length === 14) {
      q = q.eq("cnpj", cnpjDigits);
    } else {
      const esc = escapeIlikePattern(search);
      const parts = [
        `razao_social.ilike.%${esc}%`,
        `nome_fantasia.ilike.%${esc}%`,
      ];
      const partialCnpj = search.replace(/\D/g, "");
      if (partialCnpj.length > 0) {
        parts.push(`cnpj.ilike.%${partialCnpj}%`);
      }
      q = q.or(parts.join(","));
    }
  }
  if (situacao) q = q.eq("situacao_cadastral", situacao);
  if (municipios.length > 0) q = q.in("municipio", municipios);
  if (sync_status) q = q.eq("sync_status", sync_status);
  if (uf) q = q.eq("uf", uf);

  q = q.order("updated_at", { ascending: false }).range(from, to);

  const { data, error, count } = await q;

  if (error) {
    return NextResponse.json(
      { error: error.message, companies: [], count: 0 },
      { status: 500 }
    );
  }

  return NextResponse.json({
    companies: data,
    count: count ?? 0,
    page,
    limit,
  });
}

export async function POST(request: NextRequest) {
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let body: { cnpj: string; razao_social?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const clean = cleanCNPJ(body.cnpj);
  if (clean.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("companies")
    .upsert(
      {
        cnpj: clean,
        razao_social: body.razao_social ?? null,
        sync_status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cnpj" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ company: data as Company });
}

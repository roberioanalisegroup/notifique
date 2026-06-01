import { getSupabaseForRequest } from "@/lib/api-auth";
import { getR2PublicDomain } from "@/lib/r2";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: docId } = await params;

  // 1. Autenticação
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // 2. Buscar o documento na base de dados
  const { data: doc, error } = await supabase
    .from("company_alvara_documents")
    .select("file_path, file_name")
    .eq("id", docId)
    .single();

  if (error || !doc || !doc.file_path) {
    return NextResponse.json(
      { error: "Documento não encontrado ou sem arquivo associado." },
      { status: 404 }
    );
  }

  // 3. Obter o domínio público do R2
  const publicDomain = getR2PublicDomain();
  if (!publicDomain) {
    return NextResponse.json(
      { error: "Configuração do servidor de arquivos incompleta." },
      { status: 500 }
    );
  }

  const fileUrl = `https://${publicDomain}/${doc.file_path}`;

  // 4. Redirecionar o navegador para o arquivo no R2
  return NextResponse.redirect(fileUrl, 302);
}

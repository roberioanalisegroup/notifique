/**
 * POST /api/alvara-tasks/[id]/attachment
 *
 * Endpoint contextual para upload de anexo de uma tarefa de alvará.
 * O arquivo é enviado ao Cloudflare R2; os metadados são retornados
 * ao frontend para armazenamento temporário até a conclusão da tarefa.
 *
 * O registro definitivo em company_alvara_documents é criado apenas
 * pela RPC complete_alvara_task no momento da conclusão.
 */

import { getSupabaseForRequest } from "@/lib/api-auth";
import {
  getR2Client,
  getR2BucketName,
  getR2PublicDomain,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  // 1. Autenticação
  const auth = await getSupabaseForRequest(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // 2. Validar tarefa: existência, estado aberto e obter vínculo
  const { data: taskRow, error: tErr } = await supabase
    .from("alvara_tasks")
    .select("id, company_alvara_id, status")
    .eq("id", taskId)
    .single();

  if (tErr || !taskRow) {
    return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  }

  if (taskRow.status === "concluida" || taskRow.status === "cancelada") {
    return NextResponse.json(
      { error: "Esta tarefa já foi encerrada e não aceita novos anexos." },
      { status: 400 }
    );
  }

  const companyAlvaraId = taskRow.company_alvara_id;

  // 3. Extrair o ficheiro do FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Requisição inválida. Envie o ficheiro como multipart/form-data." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Nenhum ficheiro encontrado no campo 'file'." },
      { status: 400 }
    );
  }

  // 4. Validação de MIME type
  const mimeType = file.type;
  const extension = ALLOWED_MIME_TYPES[mimeType];
  if (!extension) {
    return NextResponse.json(
      {
        error: `Tipo de ficheiro não permitido: ${mimeType}. Tipos aceitos: ${Object.keys(ALLOWED_MIME_TYPES).join(", ")}.`,
      },
      { status: 400 }
    );
  }

  // 5. Validação de tamanho
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const maxMB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    return NextResponse.json(
      { error: `Ficheiro excede o limite de ${maxMB} MB.` },
      { status: 400 }
    );
  }

  // 6. Gerar storage key segura (extensão derivada do MIME, não do nome original)
  const uuid = crypto.randomUUID();
  const storageKey = `company-alvaras/${companyAlvaraId}/tasks/${taskId}/${uuid}${extension}`;

  // 7. Upload para o R2
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const r2 = getR2Client();

    await r2.send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
      })
    );
  } catch (uploadError: any) {
    console.error("[R2 UPLOAD ERROR]", uploadError);
    return NextResponse.json(
      { error: "Falha ao enviar o ficheiro para o armazenamento. Tente novamente." },
      { status: 502 }
    );
  }

  // 8. Construir URL pública (homologação) e retornar metadados
  const publicDomain = getR2PublicDomain();
  const publicUrl = `https://${publicDomain}/${storageKey}`;

  return NextResponse.json({
    storage_key: storageKey,
    public_url: publicUrl,
    file_name: file.name,
    file_size: file.size,
    file_mime_type: mimeType,
  });
}

/**
 * POST /api/alvara-tasks/[id]/attachment
 *
 * Modos:
 * 1) JSON { file_name, file_size, content_type } → URL pré-assinada (PUT directo ao R2)
 * 2) multipart/form-data com campo "file" → upload pelo servidor (fallback)
 */

import { getSupabaseForRequest } from "@/lib/api-auth";
import { MAX_FILE_SIZE_BYTES } from "@/lib/r2";
import {
  buildAlvaraAttachmentStorageKey,
  createPresignedPutUrl,
  isR2Configured,
  publicUrlForStorageKey,
  resolveUploadMime,
  uploadBufferToR2,
} from "@/lib/r2-upload";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskContext = {
  companyAlvaraId: string;
  companyCnpj: string | null;
  companyNumeroDocumento: string | null;
  alvaraName: string | null;
};

async function loadOpenTask(
  supabase: SupabaseClient,
  taskId: string
): Promise<{ ok: true; ctx: TaskContext } | { ok: false; response: NextResponse }> {
  const { data: taskRow, error: tErr } = await supabase
    .from("alvara_tasks")
    .select(`
      id,
      company_alvara_id,
      status,
      company_alvaras (
        id,
        companies (
          numero_documento,
          cnpj
        ),
        alvaras (
          name
        )
      )
    `)
    .eq("id", taskId)
    .single();

  if (tErr || !taskRow) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 }),
    };
  }

  if (taskRow.status === "concluida" || taskRow.status === "cancelada") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Esta tarefa já foi encerrada e não aceita novos anexos." },
        { status: 400 }
      ),
    };
  }

  const ca = taskRow.company_alvaras as unknown as {
    id: string;
    companies: { numero_documento: string | null; cnpj: string | null } | null;
    alvaras: { name: string | null } | null;
  } | null;

  return {
    ok: true,
    ctx: {
      companyAlvaraId: taskRow.company_alvara_id,
      companyCnpj: ca?.companies?.cnpj ?? null,
      companyNumeroDocumento: ca?.companies?.numero_documento ?? null,
      alvaraName: ca?.alvaras?.name ?? null,
    },
  };
}

function storageErrorResponse(err: unknown): NextResponse {
  console.error("[R2 UPLOAD ERROR]", err);
  try {
    require("fs").appendFileSync(
      "r2_error.log",
      new Date().toISOString() + " - " + (err instanceof Error ? err.stack : String(err)) + "\n"
    );
  } catch (e) {}
  const message = err instanceof Error ? err.message : String(err);
  const isDev = process.env.NODE_ENV !== "production";

  if (!isR2Configured()) {
    return NextResponse.json(
      {
        error:
          "Armazenamento R2 não configurado no servidor. Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME e R2_PUBLIC_CUSTOM_DOMAIN em .env.local e reinicie o servidor.",
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      error: "Falha ao enviar o ficheiro para o armazenamento. Tente novamente.",
      detail: message,
      errorName: err instanceof Error ? err.name : "UnknownError",
    },
    { status: 502 }
  );
}

function attachmentPayload(
  storageKey: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  uploadUrl?: string
) {
  return {
    storage_key: storageKey,
    public_url: publicUrlForStorageKey(storageKey),
    file_name: fileName,
    file_size: fileSize,
    file_mime_type: mimeType,
    ...(uploadUrl ? { upload_url: uploadUrl } : {}),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  // const auth = await getSupabaseForRequest(request);
  // if ("error" in auth) return auth.error;
  // const { supabase } = auth;
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);


  if (!isR2Configured()) {
    return NextResponse.json(
      {
        error:
          "Armazenamento de anexos não configurado. Contacte o administrador ou configure as variáveis R2_* no servidor.",
      },
      { status: 503 }
    );
  }

  const task = await loadOpenTask(supabase, taskId);
  if (!task.ok) return task.response;

  const contentType = request.headers.get("content-type") ?? "";

  // ── Modo 1: presign (JSON) ──
  if (contentType.includes("application/json")) {
    let body: { file_name?: string; file_size?: number; content_type?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }

    const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
    const fileSize = Number(body.file_size);
    if (!fileName) {
      return NextResponse.json({ error: "Indique o nome do ficheiro." }, { status: 400 });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Tamanho do ficheiro inválido." }, { status: 400 });
    }
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const maxMB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
      return NextResponse.json({ error: `Ficheiro excede o limite de ${maxMB} MB.` }, { status: 400 });
    }

    const mimeType = resolveUploadMime(fileName, body.content_type);
    if (!mimeType) {
      return NextResponse.json(
        {
          error: `Tipo de ficheiro não permitido. Use PDF ou imagens (PNG, JPEG, WebP).`,
        },
        { status: 400 }
      );
    }

    try {
      const storageKey = buildAlvaraAttachmentStorageKey({
        companyAlvaraId: task.ctx.companyAlvaraId,
        companyCnpj: task.ctx.companyCnpj,
        companyNumeroDocumento: task.ctx.companyNumeroDocumento,
        alvaraName: task.ctx.alvaraName,
        mimeType,
      });
      const uploadUrl = await createPresignedPutUrl(storageKey, mimeType);
      return NextResponse.json(
        attachmentPayload(storageKey, fileName, fileSize, mimeType, uploadUrl)
      );
    } catch (err) {
      return storageErrorResponse(err);
    }
  }

  // ── Modo 2: multipart (fallback) ──
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

  const mimeType = resolveUploadMime(file.name, file.type);
  if (!mimeType) {
    return NextResponse.json(
      {
        error: `Tipo de ficheiro não permitido (${file.type || "desconhecido"}). Use PDF ou imagens (PNG, JPEG, WebP).`,
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const maxMB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    return NextResponse.json({ error: `Ficheiro excede o limite de ${maxMB} MB.` }, { status: 400 });
  }

  try {
    const storageKey = buildAlvaraAttachmentStorageKey({
      companyAlvaraId: task.ctx.companyAlvaraId,
      companyCnpj: task.ctx.companyCnpj,
      companyNumeroDocumento: task.ctx.companyNumeroDocumento,
      alvaraName: task.ctx.alvaraName,
      mimeType,
    });
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadBufferToR2(storageKey, buffer, mimeType);
    return NextResponse.json(attachmentPayload(storageKey, file.name, file.size, mimeType));
  } catch (err) {
    return storageErrorResponse(err);
  }
}

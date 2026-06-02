import { MAX_UPLOAD_BYTES, resolveClientUploadMime } from "@/lib/upload-mime";

export type PreparedTaskAttachment = {
  storage_key: string;
  public_url: string;
  file_name: string;
  file_size: number;
  file_mime_type: string;
};

type PresignResponse = PreparedTaskAttachment & { upload_url?: string };

/**
 * Envia anexo de tarefa: presign + PUT directo ao R2, com fallback multipart pelo servidor.
 */
export async function uploadTaskAttachment(taskId: string, file: File): Promise<PreparedTaskAttachment> {
  const mime = resolveClientUploadMime(file.name, file.type);
  if (!mime) {
    throw new Error("Tipo de ficheiro não permitido. Use PDF ou imagens (PNG, JPEG, WebP).");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Ficheiro excede o limite de 10 MB.");
  }

  const presignRes = await fetch(`/api/alvara-tasks/${taskId}/attachment`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_name: file.name,
      file_size: file.size,
      content_type: mime,
    }),
  });
  const presignJson = (await presignRes.json()) as PresignResponse & { error?: string; detail?: string };

  if (presignRes.ok && presignJson.upload_url) {
    try {
      const putRes = await fetch(presignJson.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": mime },
      });
      if (putRes.ok) {
        const { upload_url: _u, ...meta } = presignJson;
        return meta;
      }
      console.warn("[upload] PUT presign falhou, a usar fallback multipart:", putRes.status);
    } catch (putErr) {
      console.warn("[upload] PUT presign lançou erro (possível CORS), a usar fallback multipart:", putErr);
    }
  } else if (!presignRes.ok) {
    const fullDetail = presignJson.detail ? `${presignJson.errorName ? `[${presignJson.errorName}] ` : ''}${presignJson.detail}` : undefined;
    const msg = fullDetail
      ? `${presignJson.error ?? "Erro no upload."} (${fullDetail})`
      : presignJson.error ?? "Erro ao preparar upload.";
    throw new Error(msg);
  }

  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/alvara-tasks/${taskId}/attachment`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const json = (await res.json()) as PreparedTaskAttachment & { error?: string; detail?: string; errorName?: string };
  if (!res.ok) {
    const fullDetail = json.detail ? `${json.errorName ? `[${json.errorName}] ` : ''}${json.detail}` : undefined;
    const msg = fullDetail
      ? `${json.error ?? "Erro no upload."} (${fullDetail})`
      : json.error ?? "Erro no upload.";
    throw new Error(msg);
  }
  return json;
}

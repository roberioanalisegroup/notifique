const ALLOWED: Record<string, true> = {
  "application/pdf": true,
  "image/png": true,
  "image/jpeg": true,
  "image/webp": true,
};

const EXT_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** Resolve MIME aceite (browser pode enviar type vazio no Windows). */
export function resolveClientUploadMime(fileName: string, mimeType?: string | null): string | null {
  const fromType = mimeType?.trim();
  if (fromType && ALLOWED[fromType]) return fromType;

  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
  const inferred = ext ? EXT_TO_MIME[ext] : undefined;
  if (inferred && ALLOWED[inferred]) return inferred;

  return null;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

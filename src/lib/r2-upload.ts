/**
 * Helpers partilhados para upload de anexos ao Cloudflare R2.
 */

import { getR2BucketName, getR2Client, getR2PublicDomain, ALLOWED_MIME_TYPES } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const EXT_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** Resolve MIME aceite a partir do tipo do browser ou extensão (Windows pode enviar type vazio). */
export function resolveUploadMime(fileName: string, mimeType?: string | null): string | null {
  const fromType = mimeType?.trim();
  if (fromType && ALLOWED_MIME_TYPES[fromType]) return fromType;

  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
  const inferred = ext ? EXT_TO_MIME[ext] : undefined;
  if (inferred && ALLOWED_MIME_TYPES[inferred]) return inferred;

  return null;
}

export function extensionForMime(mimeType: string): string | null {
  return ALLOWED_MIME_TYPES[mimeType] ?? null;
}

function slugify(text: string): string {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

export function buildAlvaraAttachmentStorageKey(input: {
  companyAlvaraId: string;
  companyCnpj?: string | null;
  companyNumeroDocumento?: string | null;
  alvaraName?: string | null;
  mimeType: string;
}): string {
  const extension = extensionForMime(input.mimeType);
  if (!extension) {
    throw new Error(`MIME não suportado: ${input.mimeType}`);
  }

  const rawDoc = input.companyCnpj || input.companyNumeroDocumento || "";
  const companyDir = rawDoc.replace(/\D/g, "") || `sem-documento-${input.companyAlvaraId}`;
  const alvaraDir = input.alvaraName ? slugify(input.alvaraName) : "documento";
  const uuid = crypto.randomUUID();

  return `empresas/${companyDir}/${alvaraDir}/${uuid}${extension}`;
}

export function publicUrlForStorageKey(storageKey: string): string {
  return `https://${getR2PublicDomain()}/${storageKey}`;
}

export async function uploadBufferToR2(
  storageKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const r2 = getR2Client();
  await r2.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
    })
  );
}

/** URL pré-assinada para PUT directo do browser → R2 (evita limite de body do Next.js). */
export async function createPresignedPutUrl(
  storageKey: string,
  mimeType: string,
  expiresInSeconds = 600
): Promise<string> {
  const r2 = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: storageKey,
    ContentType: mimeType,
  });
  return getSignedUrl(r2, command, { expiresIn: expiresInSeconds });
}

export function isR2Configured(): boolean {
  const keys = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_CUSTOM_DOMAIN",
  ];
  return keys.every((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim() !== "";
  });
}

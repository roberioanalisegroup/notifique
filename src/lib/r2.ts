/**
 * Cliente S3 configurado para o Cloudflare R2.
 *
 * O R2 expõe uma API compatível com S3; por isso reutilizamos o SDK oficial
 * da AWS apontando para o endpoint correto do R2.
 *
 * Variáveis de ambiente obrigatórias (somente servidor — nunca NEXT_PUBLIC_):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_CUSTOM_DOMAIN
 */

import { S3Client } from "@aws-sdk/client-s3";

function envOrThrow(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Variável de ambiente obrigatória não definida: ${key}`);
  }
  return value.trim();
}

/** Instância singleton do S3Client apontando para o Cloudflare R2. */
export function getR2Client(): S3Client {
  const accountId = envOrThrow("R2_ACCOUNT_ID");

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: envOrThrow("R2_ACCESS_KEY_ID"),
      secretAccessKey: envOrThrow("R2_SECRET_ACCESS_KEY"),
    },
  });
}

/** Nome do bucket R2 (ex: «notifique-anexos»). */
export function getR2BucketName(): string {
  return envOrThrow("R2_BUCKET_NAME");
}

/** Domínio público para construir URLs de leitura (homologação). */
export function getR2PublicDomain(): string {
  return envOrThrow("R2_PUBLIC_CUSTOM_DOMAIN").replace(/\/+$/, "");
}

/**
 * MIME types aceitos para upload de anexos de alvarás.
 * O mapeamento define também a extensão canónica para a storage key,
 * evitando confiar na extensão do nome original do ficheiro.
 */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

/** Tamanho máximo do ficheiro: 10 MB. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

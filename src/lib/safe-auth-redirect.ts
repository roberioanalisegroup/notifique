const DEFAULT_NEXT = "/portal/dashboard";

/**
 * Caminho interno seguro após OAuth / confirmação de e-mail.
 * Evita open redirect (ex.: `next=//dominio-externo.com`).
 */
export function safeAuthCallbackNextPath(raw: string | null | undefined): string {
  if (raw == null || raw === "") return DEFAULT_NEXT;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return DEFAULT_NEXT;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//")) return DEFAULT_NEXT;
  if (decoded.includes("..") || decoded.includes("\\")) return DEFAULT_NEXT;

  if (decoded === "/portal") return "/portal/dashboard";
  if (decoded.startsWith("/portal/")) return decoded;

  if (decoded === "/auth") return "/auth/login";
  if (decoded.startsWith("/auth/")) return decoded;

  return DEFAULT_NEXT;
}

/**
 * P0: garante que segredos de servidor não aparecem em variáveis NEXT_PUBLIC_*.
 * Chamado no arranque do servidor (instrumentation).
 */
export function assertServerSecretsNotPublic(): void {
  if (typeof window !== "undefined") return;

  for (const key of Object.keys(process.env)) {
    if (!key.startsWith("NEXT_PUBLIC_")) continue;
    const value = process.env[key] ?? "";
    const lower = value.toLowerCase();
    if (
      lower.includes("service_role") ||
      key.toUpperCase().includes("SERVICE_ROLE")
    ) {
      throw new Error(
        `Segurança: ${key} não pode conter service_role. Use SUPABASE_SERVICE_ROLE_KEY apenas no servidor.`
      );
    }
  }
}

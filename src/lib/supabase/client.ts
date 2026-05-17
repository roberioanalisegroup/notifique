import { createBrowserClient } from "@supabase/ssr";

const PLACEHOLDER_URL = "https://placeholder.local";
const PLACEHOLDER_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdGJ1Z2luLWJ1aWxkIn0.placeholder";

/**
 * Chaves reais vêm de `.env` em desenvolvimento e build de produção.
 * Placeholder só evita falha de build/SSR; configure o projeto no Supabase antes de usar o app.
 */
export const COOKIE_OPTIONS = {
  name: "__Secure-notifique-token",
  secure: true,
  sameSite: "lax" as const,
};

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_ANON;
  return createBrowserClient(url, key, { cookieOptions: COOKIE_OPTIONS });
}

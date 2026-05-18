import { createBrowserClient } from "@supabase/ssr";
import { BROWSER_AUTH_COOKIE_OPTIONS } from "./cookie-options";

const PLACEHOLDER_URL = "https://placeholder.local";
const PLACEHOLDER_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdGJ1Z2luLWJ1aWxkIn0.placeholder";

/**
 * Chaves reais vêm de `.env` em desenvolvimento e build de produção.
 * Placeholder só evita falha de build/SSR; configure o projeto no Supabase antes de usar o app.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_ANON;
  return createBrowserClient(url, key, {
    cookieOptions: BROWSER_AUTH_COOKIE_OPTIONS,
  });
}

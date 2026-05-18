/**
 * Cookies de auth Supabase SSR.
 * - Browser: sem httpOnly (o cliente precisa gravar a sessão após signIn).
 * - Servidor/middleware: com httpOnly.
 * - secure só em produção (localhost HTTP não envia cookies Secure).
 * Não usar `name` customizado — o @supabase/ssr gere chunks sb-*-auth-token.
 */
const isProd = process.env.NODE_ENV === "production";

export const AUTH_COOKIE_BASE = {
  sameSite: "lax" as const,
  path: "/",
  secure: isProd,
};

/** createBrowserClient — login no cliente */
export const BROWSER_AUTH_COOKIE_OPTIONS = {
  ...AUTH_COOKIE_BASE,
};

/** createServerClient / middleware / callback */
export const SERVER_AUTH_COOKIE_OPTIONS = {
  ...AUTH_COOKIE_BASE,
  httpOnly: true,
};

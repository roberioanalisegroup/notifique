import { safeAuthCallbackNextPath } from "@/lib/safe-auth-redirect";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Recebe o `?code=` do link de confirmação de e-mail (ou OAuth) e grava a sessão nos cookies.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeAuthCallbackNextPath(url.searchParams.get("next"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(new URL("/auth/login?error=env", url.origin));
  }

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // ignore
          }
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(
    new URL("/auth/login?error=nao-foi-possivel-confirmar", url.origin)
  );
}

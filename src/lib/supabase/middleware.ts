import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_OPTIONS } from "./client";

export async function updateSession(
  request: NextRequest,
  forwardedHeaders?: Headers
) {
  const reqHeaders = forwardedHeaders ?? request.headers;

  let supabaseResponse = NextResponse.next({
    request: { headers: reqHeaders },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.local";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdGJ1Z2luLWJ1aWxkIn0.placeholder";

  const supabase = createServerClient(
    url,
    key,
    {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: reqHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, { ...options, ...COOKIE_OPTIONS })
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user, supabase };
}

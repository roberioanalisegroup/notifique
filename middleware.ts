import { isAllowedBrowserOrigin } from "@/lib/request-origin";
import { canAccessSyncAll } from "@/lib/service-role-auth";
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/callback"];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return AUTH_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isSyncAllPost(request: NextRequest) {
  return (
    request.nextUrl.pathname === "/api/companies/sync-all" &&
    request.method === "POST"
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { method } = request;

  // Origin estrito para mutações em API (evita substring attacks no Host)
  if (pathname.startsWith("/api/") && ["POST", "PATCH", "DELETE", "PUT"].includes(method)) {
    if (!isAllowedBrowserOrigin(request)) {
      return NextResponse.json(
        { error: "Solicitação bloqueada por segurança (Origin inválido)" },
        { status: 403 }
      );
    }
  }

  const { user, supabaseResponse } = await updateSession(request);

  if (isSyncAllPost(request)) {
    if (!canAccessSyncAll(request, !!user)) {
      return NextResponse.json(
        {
          error:
            "Não autorizado. Inicie sessão no portal ou envie Authorization: Bearer (service role) para o cron.",
        },
        { status: 401 }
      );
    }
    return supabaseResponse;
  }

  if (pathname.startsWith("/api/")) {
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return supabaseResponse;
  }

  if (pathname.startsWith("/portal")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (isPublicPath(pathname)) {
    if (user && (pathname === "/auth/login" || pathname === "/auth/register")) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/dashboard";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/",
    "/portal/:path*",
    "/auth/:path*",
    "/api/:path*",
  ],
};

import { PORTAL_SCREEN_DEFS } from "@/config/portal-screens";
import { portalScreenRequiredForMutation } from "@/lib/api-mutation-portal-screen";
import { accessForPortalPath, effectivePortalAccess } from "@/lib/portal-access";
import { hasDisallowedCrossOrigin, isProtectedApiPath } from "@/lib/security/api-cors";
import {
  applySecurityHeaders,
  createRequestNonce,
  requestHeadersWithNonce,
} from "@/lib/security/apply-security-headers";
import { parsePortalPermissionsFromDb } from "@/lib/sanitize-portal-permissions";
import { canAccessSyncAll } from "@/lib/service-role-auth";
import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest, NextResponse } from "next/server";

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

function secure(
  request: NextRequest,
  nonce: string,
  response: NextResponse
): NextResponse {
  return applySecurityHeaders(request, response, nonce);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { method } = request;
  const nonce = createRequestNonce();
  const forwardedHeaders = requestHeadersWithNonce(request, nonce);

  if (pathname === "/api/csp-report") {
    return secure(request, nonce, NextResponse.next({ request: { headers: forwardedHeaders } }));
  }

  if (isProtectedApiPath(pathname) && method === "OPTIONS") {
    if (hasDisallowedCrossOrigin(request)) {
      return secure(
        request,
        nonce,
        NextResponse.json(
          { error: "Preflight bloqueado (Origin inválido)" },
          { status: 403 }
        )
      );
    }
    return secure(
      request,
      nonce,
      new NextResponse(null, { status: 204 })
    );
  }

  if (hasDisallowedCrossOrigin(request)) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event_type: "security_blocked_origin",
        path: pathname,
        method,
        origin: request.headers.get("origin"),
      })
    );
    return secure(
      request,
      nonce,
      NextResponse.json(
        { error: "Solicitação bloqueada por segurança (Origin inválido)" },
        { status: 403 }
      )
    );
  }

  const { user, supabaseResponse, supabase } = await updateSession(
    request,
    forwardedHeaders
  );

  if (isSyncAllPost(request)) {
    if (!canAccessSyncAll(request, !!user)) {
      return secure(
        request,
        nonce,
        NextResponse.json(
          {
            error:
              "Não autorizado. Inicie sessão no portal ou envie Authorization: Bearer (service role) para o cron.",
          },
          { status: 401 }
        )
      );
    }
    return secure(request, nonce, supabaseResponse);
  }

  if (pathname.startsWith("/api/")) {
    if (!user) {
      return secure(
        request,
        nonce,
        NextResponse.json({ error: "Não autenticado" }, { status: 401 })
      );
    }
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      const screenKey = portalScreenRequiredForMutation(pathname);
      if (screenKey) {
        const def = PORTAL_SCREEN_DEFS.find((d) => d.key === screenKey);
        const { data: prof } = await supabase
          .from("profiles")
          .select("role, portal_permissions")
          .eq("id", user.id)
          .maybeSingle();
        const access = effectivePortalAccess({
          role: typeof prof?.role === "string" ? prof.role : "user",
          portal_permissions: parsePortalPermissionsFromDb(prof?.portal_permissions),
          screenKey,
          adminOnlyScreen: def?.adminOnly === true,
        });
        if (access !== "edit") {
          return secure(
            request,
            nonce,
            NextResponse.json(
              { error: "Sem permissão para esta operação nesta área do portal." },
              { status: 403 }
            )
          );
        }
      }
    }
    return secure(request, nonce, supabaseResponse);
  }

  if (pathname.startsWith("/portal")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("next", pathname);
      return secure(request, nonce, NextResponse.redirect(url));
    }
    if (pathname === "/portal" || pathname === "/portal/") {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/dashboard";
      return secure(request, nonce, NextResponse.redirect(url));
    }
    if (!pathname.startsWith("/portal/sem-acesso")) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role, portal_permissions")
        .eq("id", user.id)
        .maybeSingle();
      const profile = {
        role: typeof prof?.role === "string" ? prof.role : "user",
        portal_permissions: parsePortalPermissionsFromDb(prof?.portal_permissions),
      };
      if (accessForPortalPath(profile, pathname) === "none") {
        const url = request.nextUrl.clone();
        url.pathname = "/portal/sem-acesso";
        return secure(request, nonce, NextResponse.redirect(url));
      }
    }
    return secure(request, nonce, supabaseResponse);
  }

  if (isPublicPath(pathname)) {
    if (user && (pathname === "/auth/login" || pathname === "/auth/register")) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/dashboard";
      return secure(request, nonce, NextResponse.redirect(url));
    }
    return secure(request, nonce, supabaseResponse);
  }

  return secure(request, nonce, supabaseResponse);
}

export const config = {
  matcher: [
    "/",
    "/portal/:path*",
    "/auth/:path*",
    "/api/:path*",
  ],
};

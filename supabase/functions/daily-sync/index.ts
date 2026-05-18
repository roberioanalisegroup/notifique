import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * Agende no Supabase (Database → Cron ou Edge Functions) para rodar, por ex., `0 3 * * *`.
 * Chama a rota do Next com assinatura HMAC (sem service_role na Edge Function).
 */
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const base = Deno.env.get("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("CRON_HMAC_SECRET");
  if (!base || !secret) {
    return new Response(
      "Missing NEXT_PUBLIC_APP_URL and CRON_HMAC_SECRET (não use SUPABASE_SERVICE_ROLE_KEY na Edge Function).",
      { status: 500 }
    );
  }

  const ts = Date.now().toString();
  const enc = new TextEncoder();
  const data = enc.encode(`${ts}.${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let sig = "";
  for (const b of bytes) sig += b.toString(16).padStart(2, "0");

  const syncRes = await fetch(`${base}/api/companies/sync-all`, {
    method: "POST",
    headers: {
      "X-Notifique-Timestamp": ts,
      "X-Notifique-Signature": sig,
    },
  });
  const body = await syncRes.text();
  return new Response(body, {
    status: syncRes.status,
    headers: { "Content-Type": "application/json" },
  });
});

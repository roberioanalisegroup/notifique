import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * Agende no Supabase (Database → Cron ou Edge Functions) para rodar, por ex., `0 3 * * *`.
 * Chama a rota do Next com assinatura (sem enviar service role); a lógica de `sync_enabled` está em /api/companies/sync-all.
 */
serve(async () => {
  const base = Deno.env.get("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("CRON_HMAC_SECRET");
  // Backward-compat (opcional): se não houver secret, ainda pode usar Bearer.
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || (!secret && !key)) {
    return new Response("Missing NEXT_PUBLIC_APP_URL and (CRON_HMAC_SECRET or SUPABASE_SERVICE_ROLE_KEY)", {
      status: 500,
    });
  }

  const ts = Date.now().toString();
  let headers: Record<string, string>;
  if (secret) {
    const enc = new TextEncoder();
    const data = enc.encode(`${ts}.${secret}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(digest);
    let sig = "";
    for (const b of bytes) sig += b.toString(16).padStart(2, "0");
    headers = {
      "X-Notifique-Timestamp": ts,
      "X-Notifique-Signature": sig,
    };
  } else {
    headers = { Authorization: `Bearer ${key}` };
  }

  const syncRes = await fetch(`${base}/api/companies/sync-all`, {
    method: "POST",
    headers,
  });
  const body = await syncRes.text();
  return new Response(body, {
    status: syncRes.status,
    headers: { "Content-Type": "application/json" },
  });
});

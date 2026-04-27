import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * Agende no Supabase (Database → Cron ou Edge Functions) para rodar, por ex., `0 3 * * *`.
 * Chama a rota do Next com o service role; a lógica de `sync_enabled` está em /api/companies/sync-all.
 */
serve(async () => {
  const base = Deno.env.get("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) {
    return new Response("Missing NEXT_PUBLIC_APP_URL or SUPABASE_SERVICE_ROLE_KEY", {
      status: 500,
    });
  }

  const syncRes = await fetch(`${base}/api/companies/sync-all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await syncRes.text();
  return new Response(body, {
    status: syncRes.status,
    headers: { "Content-Type": "application/json" },
  });
});

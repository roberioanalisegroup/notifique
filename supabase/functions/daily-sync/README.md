# daily-sync (Supabase Edge Function)

Dispara a sincronização em lote do portal chamando `POST {NEXT_PUBLIC_APP_URL}/api/companies/sync-all` com **assinatura** (sem enviar a service role key).

A rota Next verifica a tabela `sync_config`: se `sync_enabled` estiver falso, nada é processado (útil para o cron com service role).

## Variáveis de ambiente (Supabase)

- `NEXT_PUBLIC_APP_URL` — URL pública do app (Vercel/Render)
- `CRON_HMAC_SECRET` — segredo para assinar chamadas do cron (recomendado)
- `SUPABASE_SERVICE_ROLE_KEY` — fallback opcional (compatibilidade; não recomendado para cron)

## Agendamento

No painel do Supabase, crie um agendamento (Cron) apontando para invocar esta função, por exemplo `0 3 * * *` (03:00) conforme a documentação de Cron do Supabase. O horário de `sync_config.sync_time` é informativo no portal; ajuste o cron para coincidir se desejar exatidão.

## Deploy (CLI)

```bash
cd supabase/functions
# supabase login
supabase functions deploy daily-sync --project-ref <ref>
```

Defina os secrets com `supabase secrets set ...` ou no painel.

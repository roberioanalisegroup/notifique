# Portal de gestão de empresas e alvarás

Aplicação web (single-tenant) para cadastrar empresas por CNPJ, sincronizar dados com a [BrasilAPI](https://brasilapi.com.br/) (CNPJ), gerir grupos e tipos de alvará, vincular alvarás às empresas e acompanhar notificações e vencimentos.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Supabase** (PostgreSQL, Auth, RLS)
- **Tailwind CSS**
- **papaparse** (importação CSV)
- **lucide-react**, **date-fns**, **clsx**, **sonner**

## Pré-requisitos

- Node.js 18+
- Projeto no [Supabase](https://supabase.com) com o SQL de `supabase/schema.sql` executado no SQL Editor

## Configuração

1. Copie `.env.example` para `.env.local` (ou `.env`):

   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (painel: Settings → API)
   - `CRON_HMAC_SECRET` (recomendado) — segredo usado para assinar pedidos do cron para `POST /api/companies/sync-all` (não envia service role)
   - `SUPABASE_SERVICE_ROLE_KEY` (fallback/compatibilidade; apenas no servidor; **nunca** no cliente)
   - `NEXT_PUBLIC_APP_URL` — URL pública (ex.: `http://localhost:3000` ou a URL na Vercel)
   - `CSRF_ALLOWED_ORIGINS` (opcional) — lista separada por vírgulas se usares mais do que uma origin válida para o mesmo site

2. Aplique migrações no Supabase (CLI ou Dashboard), incluindo políticas RLS atualizadas em `supabase/migrations/`.

3. Instale dependências e suba o dev server:

```bash
npm install
npm run dev
```

4. Crie o primeiro utilizador em `/auth/register` (setup) ou no painel Supabase → Authentication, e faça login em `/auth/login`.

## Sincronização agendada (Supabase)

- Função: `supabase/functions/daily-sync` (ver `README.md` na pasta da função).
- Variáveis na Edge: `NEXT_PUBLIC_APP_URL` e `CRON_HMAC_SECRET` (recomendado). `SUPABASE_SERVICE_ROLE_KEY` é fallback.
- A rota `POST /api/companies/sync-all` com assinatura (ou Bearer fallback) respeita `sync_config.sync_enabled` (se desativada, o cron não processa nada).
- Exemplo de expressão de cron: `0 3 * * *` (3h) — ajuste no agendador do Supabase.

## Formato do CSV (importação)

Arquivo com cabeçalho e coluna `cnpj` (pode ser só números ou com máscara). Após a inserção, cada CNPJ é consultado na BrasilAPI com intervalo de 500 ms entre chamadas.

## API (resumo)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/stats` | KPIs e alvarás vencendo em até 30 dias |
| GET/POST | `/api/companies` | Lista (paginada) / criar (upsert por CNPJ) |
| GET/DELETE | `/api/companies/[id]` | Perfil com vínculos / excluir |
| POST | `/api/companies/sync-single` | Sincronizar um CNPJ (BrasilAPI) |
| POST | `/api/companies/sync-all` | Sincronizar em lote (sessão ou `Bearer` service role) |
| POST | `/api/companies/import` | `multipart` campo `file` — resposta em NDJSON (progresso) |
| GET/PATCH | `/api/sync-config` | Configuração de sincronização (registro fixo) |
| GET | `/api/sync-logs?limit=20` | Histórico |
| GET/POST | `/api/alvara-groups` | Grupos |
| PATCH/DELETE | `/api/alvara-groups/[id]` | |
| GET/POST | `/api/alvaras?group_id=` | Tipos de alvará |
| PATCH/DELETE | `/api/alvaras/[id]` | |
| GET/POST | `/api/company-alvaras?company_id=` | Vínculos |
| PATCH/DELETE | `/api/company-alvaras/[id]` | |

## Estrutura de pastas (principal)

```
src/
  app/
    api/                 # route handlers
    auth/login|register
    portal/              # páginas do portal (dashboard, empresas, alvarás, config)
  components/
    layout/              # sidebar, menu
    empresas/            # modais
  lib/
    supabase/            # client, server, admin, middleware helper
    cnpj-service.ts, api-client.ts, sync-helpers.ts, utils.ts
  types/
supabase/
  schema.sql
  functions/daily-sync/
```

## Build de produção

```bash
npm run build
npm start
```

O deploy em **Vercel** ou **Render** deve definir as mesmas variáveis de ambiente. Garanta que `NEXT_PUBLIC_APP_URL` seja a URL pública usada pelo cron.

## Notas

- CNPJ é armazenado só com dígitos; a formatação é só na interface.
- Entre consultas em lote à BrasilAPI é aplicado atraso de 500 ms para reduzir risco de rate limit.
- O arquivo `agente-prompt-portal-alvaras.md` na raiz descreve o escopo detalhado do produto.

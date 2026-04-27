# COMANDO PARA AGENTE — Portal de Gestão de Empresas e Alvarás

## CONTEXTO GERAL

Você é um agente desenvolvedor fullstack. Sua tarefa é construir um portal web completo do zero, seguindo rigorosamente este documento. Leia tudo antes de escrever qualquer linha de código. Execute em ordem, sem pular etapas.

---

## STACK OBRIGATÓRIA

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Banco de dados**: Supabase (PostgreSQL)
- **Autenticação**: Supabase Auth
- **Estilo**: Tailwind CSS
- **Agendamento**: Supabase Edge Functions (cron job diário)
- **API de CNPJ**: BrasilAPI — `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`
- **Importação CSV**: papaparse
- **Deploy**: compatível com Render ou Vercel

---

## ETAPA 0 — Setup inicial

1. Criar projeto Next.js 14 com TypeScript e Tailwind CSS
2. Instalar dependências: `@supabase/ssr`, `@supabase/supabase-js`, `papaparse`, `@types/papaparse`, `lucide-react`, `date-fns`, `clsx`
3. Criar `.env.example` com: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`
4. Configurar `middleware.ts` para proteger todas as rotas exceto `/auth/login`
5. Criar `src/lib/supabase/client.ts` e `src/lib/supabase/server.ts`
6. Criar `src/lib/utils.ts` com: `formatCNPJ(cnpj)`, `cleanCNPJ(cnpj)`, `formatDate(date)`, `formatCurrency(value)`, `cn(...classes)`

---

## ETAPA 1 — Banco de dados (Supabase)

Criar arquivo `supabase/schema.sql` com o seguinte schema completo. Executar no SQL Editor do Supabase.

### Tabela: `companies`

```sql
create table public.companies (
  id                  uuid primary key default gen_random_uuid(),
  cnpj                text not null unique,                  -- somente números, 14 dígitos
  razao_social        text,
  nome_fantasia       text,
  situacao_cadastral  text,                                  -- ATIVA, SUSPENSA, INAPTA, BAIXADA
  data_situacao       date,
  natureza_juridica   text,
  atividade_principal text,                                  -- código + descrição CNAE
  atividades_secundarias jsonb default '[]',
  logradouro          text,
  numero              text,
  complemento         text,
  bairro              text,
  municipio           text,
  uf                  text,
  cep                 text,
  telefone            text,
  email               text,
  capital_social      numeric(15,2),
  porte               text,
  opcao_simples       boolean,
  opcao_mei           boolean,
  data_abertura       date,
  raw_data            jsonb,                                 -- resposta completa da API guardada
  last_sync_at        timestamptz,                           -- última sincronização com API
  sync_status         text default 'pending',               -- pending | success | error | not_found
  sync_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
```

### Tabela: `sync_config`

```sql
create table public.sync_config (
  id           uuid primary key default gen_random_uuid(),
  sync_enabled boolean not null default true,
  sync_time    time not null default '03:00:00',             -- horário do cron diário
  date_start   date,                                         -- filtrar empresas abertas a partir de
  date_end     date,                                         -- filtrar empresas abertas até
  only_active  boolean not null default false,               -- sincronizar apenas situação ATIVA
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Registro único de configuração
insert into public.sync_config (id) values ('00000000-0000-0000-0000-000000000001');
```

### Tabela: `sync_logs`

```sql
create table public.sync_logs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  total         int default 0,
  success       int default 0,
  errors        int default 0,
  skipped       int default 0,
  triggered_by  text default 'cron',                        -- cron | manual | import | individual
  notes         text
);
```

### Tabela: `alvara_groups`

```sql
create table public.alvara_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  color       text default '#3b82f6',
  icon        text default 'file-text',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

Exemplos para seed: "Comércio Geral", "Área da Saúde", "Alimentação e Bebidas", "Serviços", "Indústria"

### Tabela: `alvaras`

```sql
create table public.alvaras (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.alvara_groups(id) on delete restrict,
  name             text not null,
  description      text,
  orgao_emissor    text,                                     -- ex: Prefeitura, Vigilância Sanitária
  validade_meses   int,                                      -- validade padrão em meses
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```

### Tabela: `company_alvaras` (vínculo empresa ↔ alvará)

```sql
create table public.company_alvaras (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  alvara_id            uuid not null references public.alvaras(id) on delete restrict,
  numero               text,                                 -- número do alvará emitido
  data_emissao         date,
  data_vencimento      date,
  data_notificacao     date,                                 -- data em que a empresa foi notificada
  status               text not null default 'pendente',    -- pendente | emitido | vencido | renovando | cancelado
  observacoes          text,
  arquivo_url          text,                                 -- URL do documento anexado
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (company_id, alvara_id)
);
```

### Índices e triggers

```sql
-- Índices
create index idx_companies_cnpj         on public.companies(cnpj);
create index idx_companies_situacao     on public.companies(situacao_cadastral);
create index idx_companies_municipio    on public.companies(municipio);
create index idx_companies_sync_status  on public.companies(sync_status);
create index idx_company_alvaras_co     on public.company_alvaras(company_id);
create index idx_company_alvaras_alv    on public.company_alvaras(alvara_id);
create index idx_company_alvaras_notif  on public.company_alvaras(data_notificacao);

-- Trigger updated_at genérico
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger trg_companies_upd    before update on public.companies    for each row execute function set_updated_at();
create trigger trg_alv_groups_upd   before update on public.alvara_groups for each row execute function set_updated_at();
create trigger trg_alvaras_upd      before update on public.alvaras       for each row execute function set_updated_at();
create trigger trg_co_alvaras_upd   before update on public.company_alvaras for each row execute function set_updated_at();
create trigger trg_sync_config_upd  before update on public.sync_config   for each row execute function set_updated_at();
```

### RLS

Habilitar RLS em todas as tabelas. Para este projeto (single-tenant), criar policy permissiva apenas para usuários autenticados:

```sql
alter table public.companies        enable row level security;
alter table public.alvara_groups    enable row level security;
alter table public.alvaras          enable row level security;
alter table public.company_alvaras  enable row level security;
alter table public.sync_config      enable row level security;
alter table public.sync_logs        enable row level security;

-- Policy: qualquer usuário autenticado tem acesso total
create policy "auth_full" on public.companies        for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.alvara_groups    for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.alvaras          for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.company_alvaras  for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.sync_config      for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.sync_logs        for all using (auth.role() = 'authenticated');
```

### View útil: `companies_alvara_summary`

Se a view já existir com outras colunas, use `drop view` antes (ou executar o bloco abaixo completo com `drop`).

```sql
drop view if exists public.companies_alvara_summary;

create view public.companies_alvara_summary as
select
  c.id,
  c.cnpj,
  c.razao_social,
  c.nome_fantasia,
  c.situacao_cadastral,
  c.municipio,
  c.uf,
  c.last_sync_at,
  c.sync_status,
  c.updated_at,
  count(ca.id)                                              as total_alvaras,
  count(ca.id) filter (where ca.status = 'emitido')        as alvaras_emitidos,
  count(ca.id) filter (where ca.status = 'pendente')       as alvaras_pendentes,
  count(ca.id) filter (where ca.status = 'vencido')        as alvaras_vencidos,
  count(ca.id) filter (where ca.data_notificacao is not null) as alvaras_notificados
from public.companies c
left join public.company_alvaras ca on ca.company_id = c.id
group by c.id;
```

---

## ETAPA 2 — Tipos TypeScript

Criar `src/types/index.ts` com interfaces para todas as tabelas: `Company`, `SyncConfig`, `SyncLog`, `AlvaraGroup`, `Alvara`, `CompanyAlvara`, `CompanyAlvaraSummary`.

Criar também os tipos de formulário (`CompanyFormData`, `AlvaraGroupFormData`, `AlvaraFormData`, `CompanyAlvaraFormData`) e o tipo de resposta da BrasilAPI:

```typescript
interface BrasilAPICNPJ {
  cnpj: string
  razao_social: string
  nome_fantasia: string
  situacao_cadastral: string        // "ATIVA" | "BAIXADA" | etc
  data_situacao_cadastral: string
  natureza_juridica: string
  atividade_principal: Array<{ codigo: string; descricao: string }>
  atividades_secundarias: Array<{ codigo: string; descricao: string }>
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  ddd_telefone_1: string
  email: string
  capital_social: number
  porte: string
  opcao_pelo_simples: boolean
  opcao_pelo_mei: boolean
  data_inicio_atividade: string
}
```

---

## ETAPA 3 — Serviço de consulta CNPJ

Criar `src/lib/cnpj-service.ts` com a função:

```typescript
async function fetchCNPJData(cnpj: string): Promise<{ data: BrasilAPICNPJ | null; error: string | null }>
```

Regras obrigatórias:
- Limpar o CNPJ (remover `.`, `/`, `-`) antes de consultar
- URL: `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`
- Timeout de 10 segundos
- Se status 404: retornar `{ data: null, error: 'CNPJ não encontrado' }`
- Se status 429: retornar `{ data: null, error: 'Rate limit atingido' }`
- Mapear a resposta para o formato da tabela `companies`

Criar também função `mapBrasilAPIToCompany(data: BrasilAPICNPJ): Partial<Company>` que converte os campos da API para os campos da tabela.

---

## ETAPA 4 — API Routes

### `POST /api/companies/sync-single`
- Body: `{ cnpj: string }`
- Consulta a BrasilAPI
- Faz upsert na tabela `companies` pelo CNPJ
- Atualiza `last_sync_at`, `sync_status`, `raw_data`
- Retorna os dados atualizados da empresa

### `POST /api/companies/sync-all`
- Busca todas as empresas com filtro da `sync_config` (date_start, date_end, only_active)
- Para cada empresa, faz a consulta na BrasilAPI com delay de 500ms entre chamadas (evitar rate limit)
- Atualiza `sync_status` e `last_sync_at` de cada uma
- Cria registro em `sync_logs` com resultado
- Retorna sumário: `{ total, success, errors, skipped }`

### `POST /api/companies/import`
- Recebe multipart/form-data com arquivo CSV
- Parseia com papaparse (campos esperados: `cnpj` obrigatório; demais opcionais)
- Valida cada CNPJ (14 dígitos)
- Faz insert em lote ignorando duplicatas (upsert com `onConflict: 'cnpj'`)
- Dispara `sync-single` para cada CNPJ importado (com delay de 500ms entre cada)
- Retorna: `{ imported, duplicates, errors, companies[] }`

### `GET /api/companies`
- Query params: `page`, `limit`, `search` (razão social ou CNPJ), `situacao`, `municipio`, `sync_status`, `uf`
- Retorna lista paginada com `count`

### `GET /api/companies/[id]`
- Retorna dados completos da empresa + `company_alvaras` com join em `alvaras` e `alvara_groups`

### `DELETE /api/companies/[id]`
- Deleta a empresa (cascade remove company_alvaras)

### `GET /api/sync-config`
- Retorna o registro único de configuração

### `PATCH /api/sync-config`
- Atualiza campos de configuração

### `GET /api/sync-logs`
- Retorna os últimos 20 logs ordenados por `started_at desc`

### `GET/POST /api/alvara-groups`
### `PATCH/DELETE /api/alvara-groups/[id]`
### `GET/POST /api/alvaras`
- GET com query param `group_id` para filtrar por grupo
### `PATCH/DELETE /api/alvaras/[id]`
### `GET/POST /api/company-alvaras`
- POST cria vínculo empresa ↔ alvará
### `PATCH/DELETE /api/company-alvaras/[id]`

---

## ETAPA 5 — Edge Function (cron job diário)

Criar `supabase/functions/daily-sync/index.ts`:

- Função invocada via Supabase Cron (configurar no painel: `0 3 * * *` para 3h da manhã)
- Lê a `sync_config`: se `sync_enabled = false`, encerra sem fazer nada
- Chama internamente o endpoint `/api/companies/sync-all` usando a `SUPABASE_SERVICE_ROLE_KEY`
- Registra resultado em `sync_logs` com `triggered_by = 'cron'`

Criar `supabase/functions/daily-sync/README.md` com instruções de deploy da Edge Function.

---

## ETAPA 6 — Páginas do portal

### Layout geral

Criar `src/components/layout/sidebar.tsx` com os seguintes itens de navegação:

```
Dashboard          /portal/dashboard
Empresas           /portal/empresas
  └ Lista          /portal/empresas
  └ Importar       /portal/empresas/importar
Alvarás            /portal/alvaras
  └ Grupos         /portal/alvaras/grupos
  └ Tipos          /portal/alvaras
Configurações      /portal/configuracoes
  └ Sincronização  /portal/configuracoes/sincronizacao
  └ Usuários       /portal/configuracoes/usuarios
```

### Página: `/portal/dashboard`

Exibir cards de KPIs:
- Total de empresas cadastradas
- Empresas com situação ATIVA
- Empresas com sync pendente (nunca sincronizadas)
- Total de alvarás cadastrados
- Alvarás vencidos (data_vencimento < hoje)
- Notificações enviadas no mês (data_notificacao no mês atual)

Exibir tabela "Últimas sincronizações" (sync_logs, últimos 5).

Exibir tabela "Alvarás vencendo nos próximos 30 dias".

### Página: `/portal/empresas`

Lista de empresas com:
- Barra de busca (razão social ou CNPJ)
- Filtros: Situação Cadastral, UF, Município, Status de Sync
- Tabela com colunas: CNPJ (formatado), Razão Social, Município/UF, Situação, Última Sync, Alvarás (badge com contagem), Ações
- Paginação (20 por página)
- Botão "Nova empresa" → abre modal de cadastro individual
- Botão "Importar CSV" → link para `/portal/empresas/importar`
- Botão "Sincronizar todas" → chama `/api/companies/sync-all` com feedback de progresso

**Modal de nova empresa:**
- Campo: CNPJ (com máscara `XX.XXX.XXX/XXXX-XX`)
- Ao sair do campo CNPJ (onBlur), chamar `/api/companies/sync-single` automaticamente
- Exibir spinner enquanto consulta
- Se encontrado: preencher campos automaticamente (razão social, endereço, etc.) em modo somente leitura
- Se não encontrado: exibir erro mas permitir salvar com CNPJ apenas
- Botão "Salvar"

### Página: `/portal/empresas/importar`

Área de upload de CSV com drag-and-drop.

**Formato esperado do CSV** (exibir exemplo para download):
```
cnpj
12.345.678/0001-90
98.765.432/0001-10
```
O CNPJ pode estar formatado ou só com números — ambos devem ser aceitos.

Fluxo:
1. Upload do arquivo
2. Parsear e exibir preview: quantas linhas, CNPJs válidos e inválidos
3. Botão "Confirmar importação"
4. Progresso em tempo real (via polling ou Server-Sent Events) mostrando empresa por empresa sendo consultada na API
5. Resultado final: importadas com sucesso, duplicatas ignoradas, erros

### Página: `/portal/empresas/[id]`

Perfil completo da empresa com abas:

**Aba "Dados Cadastrais":**
- Exibir todos os campos da empresa em layout de ficha
- Badge de situação cadastral com cor (verde=ATIVA, vermelho=BAIXADA, amarelo=demais)
- Botão "Atualizar dados" → chama sync-single e recarrega a página
- Data e status da última sincronização

**Aba "Alvarás":**
- Lista de alvarás vinculados à empresa
- Para cada alvará: nome, grupo, número, data emissão, data vencimento, data notificação, status
- Badge de status com cor
- Botão "Vincular alvará" → modal para adicionar novo vínculo
- Na linha de cada alvará: botão editar (abre modal) e botão desvincular
- Alerta visual para alvarás vencidos ou próximos do vencimento (≤ 30 dias)

**Modal "Vincular alvará":**
- Select de Grupo de Alvará (carrega `alvara_groups`)
- Select de Alvará (carrega `alvaras` filtrados pelo grupo selecionado)
- Campo: Número do alvará (texto livre)
- Campo: Data de emissão (date)
- Campo: Data de vencimento (date)
- Campo: Data de notificação (date) — com label "Data em que a empresa foi notificada"
- Campo: Status (select: pendente, emitido, vencido, renovando, cancelado)
- Campo: Observações (textarea)
- Botão salvar

### Página: `/portal/alvaras/grupos`

Listagem dos grupos de alvarás em cards:
- Nome, descrição, cor, quantidade de alvarás no grupo
- Botão "Novo grupo" → modal
- Em cada card: botão editar, botão ver alvarás do grupo, botão excluir (bloquear se tiver alvarás)

**Modal de grupo:**
- Nome (obrigatório)
- Descrição
- Cor (color picker simples com 8 opções predefinidas)

### Página: `/portal/alvaras`

Listagem de todos os tipos de alvarás:
- Filtro por grupo
- Colunas: Nome, Grupo (badge colorido), Órgão emissor, Validade, Qtd. vinculados
- Botão "Novo alvará" → modal
- Ações: editar, excluir

**Modal de alvará:**
- Nome (obrigatório)
- Grupo (select de alvara_groups, obrigatório)
- Descrição
- Órgão emissor
- Validade em meses

### Página: `/portal/configuracoes/sincronizacao`

Formulário com os campos da `sync_config`:
- Toggle: Sincronização automática diária ativada
- Horário da sincronização (time input)
- Filtro por período de abertura da empresa:
  - Data início (date) — "Sincronizar empresas abertas a partir de"
  - Data fim (date) — "Sincronizar empresas abertas até"
- Toggle: Sincronizar apenas empresas ATIVAS
- Botão "Salvar configurações"

Abaixo do formulário:
- Seção "Histórico de sincronizações" com tabela dos sync_logs (data, total, sucesso, erros, tempo gasto, disparado por)
- Botão "Executar sincronização agora" → chama `/api/companies/sync-all` e exibe progresso

---

## ETAPA 7 — Autenticação

Criar páginas `/auth/login` e `/auth/register` (registro apenas para setup inicial).

O middleware deve:
- Redirecionar `/` para `/portal/dashboard`
- Proteger todas as rotas `/portal/*` e `/api/*` (exceto `/api/companies/sync-all` que pode ser chamado pela Edge Function com service role)

---

## ETAPA 8 — README

Criar `README.md` com:
- Descrição do projeto
- Stack
- Instruções de setup (Supabase, .env, npm install, npm run dev)
- Como configurar o cron job no Supabase
- Formato do CSV de importação
- Endpoints da API (listagem resumida)
- Estrutura de pastas

---

## REGRAS GERAIS PARA O AGENTE

1. **Nunca deixar dados mockados** — todas as telas devem consumir dados reais das API Routes
2. **Tratamento de erro em toda chamada de API** — exibir mensagem amigável ao usuário, nunca deixar erro silencioso
3. **Loading states** — toda operação assíncrona deve ter spinner ou skeleton
4. **CNPJ sempre limpo no banco** (só números) e formatado apenas na exibição (`XX.XXX.XXX/XXXX-XX`)
5. **Rate limit da BrasilAPI**: sempre aguardar 500ms entre chamadas em lote
6. **Paginação** em todas as listagens com mais de 20 itens
7. **Confirmação antes de deletar** qualquer registro
8. **Responsivo** — sidebar colapsável em telas menores
9. **Feedback visual** após toda ação (save, delete, sync): toast de sucesso ou erro
10. **TypeScript strict** — sem `any` desnecessário

---

## ORDEM DE EXECUÇÃO

```
Etapa 0 → Setup
Etapa 1 → Schema SQL (gerar arquivo, não executar)
Etapa 2 → Types
Etapa 3 → CNPJ Service
Etapa 4 → API Routes
Etapa 5 → Edge Function
Etapa 6 → Páginas (na ordem: Layout → Dashboard → Empresas → Perfil → Alvarás → Configurações)
Etapa 7 → Auth
Etapa 8 → README
```

Ao finalizar, gerar `.zip` com todo o projeto pronto para rodar com `npm install && npm run dev`.

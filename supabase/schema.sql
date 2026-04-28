-- Portal de Gestão de Empresas e Alvarás — executar no SQL Editor do Supabase

create table public.companies (
  id                  uuid primary key default gen_random_uuid(),
  cadastro_tipo       text not null default 'cnpj'
    check (cadastro_tipo in ('cnpj', 'mei', 'caepf', 'cpf', 'outros')),
  numero_documento    text not null,
  cnpj                text,
  razao_social        text,
  nome_fantasia       text,
  situacao_cadastral  text,
  data_situacao       date,
  natureza_juridica   text,
  atividade_principal text,
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
  raw_data            jsonb,
  last_sync_at        timestamptz,
  sync_status         text default 'pending',
  sync_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (numero_documento)
);

create index idx_companies_cnpj_nn on public.companies (cnpj) where cnpj is not null;

create table public.sync_config (
  id           uuid primary key default gen_random_uuid(),
  sync_enabled boolean not null default true,
  sync_time    time not null default '03:00:00',
  date_start   date,
  date_end     date,
  only_active  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.sync_config (id) values ('00000000-0000-0000-0000-000000000001');

create table public.sync_logs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  total         int default 0,
  success       int default 0,
  errors        int default 0,
  skipped       int default 0,
  triggered_by  text default 'cron',
  notes         text
);

-- Dados de perfil (nome, telefone) por utilizador Supabase Auth; a lista/gestão usa a API (service role)
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

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

create table public.alvaras (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid references public.alvara_groups(id) on delete restrict,
  name             text not null,
  description      text,
  orgao_emissor    text,
  frequencia       text not null default 'mensal'
    check (frequencia in (
      'diaria', 'semanal', 'decendial', 'mensal', 'bimestral',
      'trimestral', 'semestral', 'anual'
    )),
  weekend_adjust   text not null default 'none'
    check (weekend_adjust in ('none', 'postpone', 'anticipate')),
  legal_dia          smallint check (legal_dia is null or (legal_dia >= 1 and legal_dia <= 31)),
  legal_mes          smallint check (legal_mes is null or (legal_mes >= 1 and legal_mes <= 12)),
  legal_dia_semana   smallint check (legal_dia_semana is null or (legal_dia_semana >= 0 and legal_dia_semana <= 6)),
  legal_dias_uteis   smallint check (legal_dias_uteis is null or (legal_dias_uteis >= 0 and legal_dias_uteis <= 60)),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.company_alvaras (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  alvara_id            uuid not null references public.alvaras(id) on delete restrict,
  numero               text,
  data_emissao         date,
  data_vencimento      date,
  data_notificacao     date,
  status               text not null default 'pendente',
  observacoes          text,
  arquivo_url          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (company_id, alvara_id)
);

create table public.alvara_tasks (
  id                    uuid primary key default gen_random_uuid(),
  company_alvara_id     uuid not null references public.company_alvaras(id) on delete cascade,
  due_date              date not null,
  status                text not null default 'pendente'
    check (status in ('pendente', 'concluida', 'cancelada')),
  title                 text,
  completed_at          timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_alvara_id, due_date)
);

create table public.alvara_task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.alvara_tasks(id) on delete cascade,
  event_type text not null
    check (event_type in ('created', 'status', 'notes', 'attachment', 'due_date', 'system')),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_alvara_task_history_task
  on public.alvara_task_history (task_id, created_at desc);

create index idx_alvara_tasks_due
  on public.alvara_tasks (due_date) where status = 'pendente';
create index idx_alvara_tasks_ca
  on public.alvara_tasks (company_alvara_id);

create index idx_companies_situacao     on public.companies(situacao_cadastral);
create index idx_companies_municipio    on public.companies(municipio);
create index idx_companies_sync_status  on public.companies(sync_status);
create index idx_company_alvaras_co     on public.company_alvaras(company_id);
create index idx_company_alvaras_alv    on public.company_alvaras(alvara_id);
create index idx_company_alvaras_notif  on public.company_alvaras(data_notificacao);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger trg_companies_upd    before update on public.companies    for each row execute function public.set_updated_at();
create trigger trg_alv_groups_upd   before update on public.alvara_groups for each row execute function public.set_updated_at();
create trigger trg_alvaras_upd      before update on public.alvaras       for each row execute function public.set_updated_at();
create trigger trg_co_alvaras_upd   before update on public.company_alvaras for each row execute function public.set_updated_at();
create trigger trg_alvara_tasks_upd before update on public.alvara_tasks  for each row execute function public.set_updated_at();
create trigger trg_sync_config_upd  before update on public.sync_config   for each row execute function public.set_updated_at();
create trigger trg_profiles_upd     before update on public.profiles     for each row execute function public.set_updated_at();

create or replace function public.alvara_task_log_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.alvara_task_history (task_id, event_type, summary, metadata)
  values (
    new.id,
    'created',
    'Tarefa criada',
    jsonb_build_object(
      'due_date', new.due_date::text,
      'status', new.status
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_alvara_task_created_hist on public.alvara_tasks;
create trigger trg_alvara_task_created_hist
  after insert on public.alvara_tasks
  for each row execute function public.alvara_task_log_created();

-- Novo registo no Auth cria linha em public.profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Utilizadores já existentes antes deste script
insert into public.profiles (id, display_name)
select
  id,
  coalesce(
    raw_user_meta_data->>'display_name',
    raw_user_meta_data->>'full_name',
    split_part(coalesce(email, ''), '@', 1)
  )
from auth.users
on conflict (id) do nothing;

alter table public.companies        enable row level security;
alter table public.alvara_groups    enable row level security;
alter table public.alvaras          enable row level security;
alter table public.company_alvaras  enable row level security;
alter table public.sync_config      enable row level security;
alter table public.sync_logs        enable row level security;
alter table public.profiles         enable row level security;
alter table public.alvara_tasks     enable row level security;
alter table public.alvara_task_history enable row level security;

-- Sem policy: utilizadores acedem via rotas /api/users (service role). Evita leitura direta (RLS deny).

create policy "auth_full" on public.companies        for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.alvara_groups    for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.alvaras          for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.company_alvaras  for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.alvara_tasks     for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.alvara_task_history for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.sync_config      for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.sync_logs        for all using (auth.role() = 'authenticated');

-- drop + create: "create or replace view" não permite alterar ordem/nomes de colunas face a uma view já existente
drop view if exists public.companies_alvara_summary;

create view public.companies_alvara_summary as
select
  c.id,
  c.cadastro_tipo,
  c.numero_documento,
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

grant select on public.companies_alvara_summary to authenticated, service_role;

insert into public.alvara_groups (name, description, color) values
  ('Comércio Geral', 'Comércio varejista geral', '#22c55e'),
  ('Área da Saúde', 'Estabelecimentos de saúde', '#ec4899'),
  ('Alimentação e Bebidas', 'Restaurantes e similares', '#f97316'),
  ('Serviços', 'Prestadores de serviço', '#6366f1'),
  ('Indústria', 'Produção industrial', '#64748b');

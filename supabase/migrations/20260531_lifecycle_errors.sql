-- Tabela de logs persistentes para falhas de ciclo de vida de alvarás
-- Utilizada para registrar falhas graves durante transições de ciclo e rollbacks mal sucedidos.
create table if not exists public.lifecycle_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_alvara_id uuid not null,
  error_message text not null,
  original_state jsonb not null,
  failed_state jsonb null,
  resolved boolean not null default false
);

comment on table public.lifecycle_errors is 'Registros de inconsistências graves e falhas de rollback no ciclo de vida de alvarás';

-- Ativa RLS para segurança, permitindo acesso apenas para o service role
alter table public.lifecycle_errors enable row level security;

-- Não permitir escrita/leitura via cliente público (authenticated/anon)
drop policy if exists "lifecycle_errors_no_public" on public.lifecycle_errors;
create policy "lifecycle_errors_no_public" on public.lifecycle_errors
  for all using (false) with check (false);

grant all on public.lifecycle_errors to service_role;

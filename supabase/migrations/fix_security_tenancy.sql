-- Migração para implementar Isolamento de Dados (Multi-tenancy) e Segurança RLS
-- Ponto 1: Corrigir autorização
-- Ponto 2: Adicionar user_id

-- 1. Adicionar user_id à tabela de empresas
alter table public.companies add column if not exists user_id uuid references auth.users(id);

-- 2. Tentar associar empresas existentes ao primeiro utilizador (para não quebrar o ambiente atual)
do $$
declare
  first_user uuid;
begin
  select id into first_user from auth.users limit 1;
  if first_user is not null then
    update public.companies set user_id = first_user where user_id is null;
  end if;
end $$;

-- 3. Remover as políticas antigas permissivas "auth_full"
drop policy if exists "auth_full" on public.companies;
drop policy if exists "auth_full" on public.company_alvaras;
drop policy if exists "auth_full" on public.alvara_tasks;
drop policy if exists "auth_full" on public.alvara_task_history;
drop policy if exists "auth_full" on public.alvara_task_checklist_progress;
drop policy if exists "auth_full" on public.alvara_groups;
drop policy if exists "auth_full" on public.alvaras;
drop policy if exists "auth_full" on public.alvara_checklist_items;

-- 4. Criar novas políticas baseadas no proprietário (Proprietário da Empresa)

-- COMPANIES: Apenas o dono vê/edita
create policy "users_manage_own_companies" on public.companies
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- COMPANY_ALVARAS: Apenas se a empresa pertencer ao utilizador
create policy "users_manage_own_company_alvaras" on public.company_alvaras
  for all using (
    exists (
      select 1 from public.companies
      where companies.id = company_alvaras.company_id
      and companies.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.companies
      where companies.id = company_alvaras.company_id
      and companies.user_id = auth.uid()
    )
  );

-- ALVARA_TASKS: Acesso via vínculo da empresa
create policy "users_manage_own_alvara_tasks" on public.alvara_tasks
  for all using (
    exists (
      select 1 from public.company_alvaras
      join public.companies on companies.id = company_alvaras.company_id
      where company_alvaras.id = alvara_tasks.company_alvara_id
      and companies.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.company_alvaras
      join public.companies on companies.id = company_alvaras.company_id
      where company_alvaras.id = alvara_tasks.company_alvara_id
      and companies.user_id = auth.uid()
    )
  );

-- ALVARA_TASK_HISTORY: Acesso via tarefa
create policy "users_manage_own_alvara_task_history" on public.alvara_task_history
  for all using (
    exists (
      select 1 from public.alvara_tasks
      join public.company_alvaras on company_alvaras.id = alvara_tasks.company_alvara_id
      join public.companies on companies.id = company_alvaras.company_id
      where alvara_tasks.id = alvara_task_history.task_id
      and companies.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.alvara_tasks
      join public.company_alvaras on company_alvaras.id = alvara_tasks.company_alvara_id
      join public.companies on companies.id = company_alvaras.company_id
      where alvara_tasks.id = alvara_task_history.task_id
      and companies.user_id = auth.uid()
    )
  );

-- ALVARA_TASK_CHECKLIST_PROGRESS: Acesso via tarefa
create policy "users_manage_own_checklist_progress" on public.alvara_task_checklist_progress
  for all using (
    exists (
      select 1 from public.alvara_tasks
      join public.company_alvaras on company_alvaras.id = alvara_tasks.company_alvara_id
      join public.companies on companies.id = company_alvaras.company_id
      where alvara_tasks.id = alvara_task_checklist_progress.task_id
      and companies.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.alvara_tasks
      join public.company_alvaras on company_alvaras.id = alvara_tasks.company_alvara_id
      join public.companies on companies.id = company_alvaras.company_id
      where alvara_tasks.id = alvara_task_checklist_progress.task_id
      and companies.user_id = auth.uid()
    )
  );

-- 5. Tabelas Globais (Catálogo): Todos autenticados leem, mas ninguém edita (exceto via API admin/service_role)
-- ALVARA_GROUPS
create policy "everyone_read_groups" on public.alvara_groups
  for select using (auth.role() = 'authenticated');

-- ALVARAS
create policy "everyone_read_alvaras" on public.alvaras
  for select using (auth.role() = 'authenticated');

-- ALVARA_CHECKLIST_ITEMS
create policy "everyone_read_checklist_items" on public.alvara_checklist_items
  for select using (auth.role() = 'authenticated');

-- PROFILES
create policy "users_manage_own_profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- 6. Garantir que o user_id é obrigatório para novas empresas (opcional, mas recomendado)
-- alter table public.companies alter column user_id set not null;

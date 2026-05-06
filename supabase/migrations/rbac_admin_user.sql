-- Migração para implementar Níveis de Acesso (RBAC): Admin vs User
-- Ponto 4: Isolamento por Perfil/Cargo

-- 1. Adicionar coluna de role (cargo) à tabela de perfis
alter table public.profiles add column if not exists role text not null default 'user'
  check (role in ('admin', 'user'));

-- 2. Criar função para verificar se o utilizador atual é administrador
-- Usamos 'security definer' para que a função tenha acesso à leitura de profiles mesmo que o utilizador não tenha
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- 3. Definir o primeiro utilizador como administrador (opcional, para garantir acesso inicial)
do $$
declare
  first_user uuid;
begin
  select id into first_user from public.profiles order by created_at asc limit 1;
  if first_user is not null then
    update public.profiles set role = 'admin' where id = first_user;
  end if;
end $$;

-- 4. Atualizar as políticas de RLS para permitir acesso total a Administradores

-- COMPANIES
drop policy if exists "users_manage_own_companies" on public.companies;
create policy "users_manage_own_companies" on public.companies
  for all using (user_id = auth.uid() or public.is_admin()) 
  with check (user_id = auth.uid() or public.is_admin());

-- COMPANY_ALVARAS
drop policy if exists "users_manage_own_company_alvaras" on public.company_alvaras;
create policy "users_manage_own_company_alvaras" on public.company_alvaras
  for all using (
    public.is_admin() or
    exists (
      select 1 from public.companies
      where companies.id = company_alvaras.company_id
      and companies.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or
    exists (
      select 1 from public.companies
      where companies.id = company_alvaras.company_id
      and companies.user_id = auth.uid()
    )
  );

-- ALVARA_TASKS
drop policy if exists "users_manage_own_alvara_tasks" on public.alvara_tasks;
create policy "users_manage_own_alvara_tasks" on public.alvara_tasks
  for all using (
    public.is_admin() or
    exists (
      select 1 from public.company_alvaras
      join public.companies on companies.id = company_alvaras.company_id
      where company_alvaras.id = alvara_tasks.company_alvara_id
      and companies.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or
    exists (
      select 1 from public.company_alvaras
      join public.companies on companies.id = company_alvaras.company_id
      where company_alvaras.id = alvara_tasks.company_alvara_id
      and companies.user_id = auth.uid()
    )
  );

-- ALVARA_TASK_HISTORY
drop policy if exists "users_manage_own_alvara_task_history" on public.alvara_task_history;
create policy "users_manage_own_alvara_task_history" on public.alvara_task_history
  for all using (
    public.is_admin() or
    exists (
      select 1 from public.alvara_tasks
      join public.company_alvaras on company_alvaras.id = alvara_tasks.company_alvara_id
      join public.companies on companies.id = company_alvaras.company_id
      where alvara_tasks.id = alvara_task_history.task_id
      and companies.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or
    exists (
      select 1 from public.alvara_tasks
      join public.company_alvaras on company_alvaras.id = alvara_tasks.company_alvara_id
      join public.companies on companies.id = company_alvaras.company_id
      where alvara_tasks.id = alvara_task_history.task_id
      and companies.user_id = auth.uid()
    )
  );

-- ALVARA_TASK_CHECKLIST_PROGRESS
drop policy if exists "users_manage_own_checklist_progress" on public.alvara_task_checklist_progress;
create policy "users_manage_own_checklist_progress" on public.alvara_task_checklist_progress
  for all using (
    public.is_admin() or
    exists (
      select 1 from public.alvara_tasks
      join public.company_alvaras on company_alvaras.id = alvara_tasks.company_alvara_id
      join public.companies on companies.id = company_alvaras.company_id
      where alvara_tasks.id = alvara_task_checklist_progress.task_id
      and companies.user_id = auth.uid()
    )
  ) with check (
    public.is_admin() or
    exists (
      select 1 from public.alvara_tasks
      join public.company_alvaras on company_alvaras.id = alvara_tasks.company_alvara_id
      join public.companies on companies.id = company_alvaras.company_id
      where alvara_tasks.id = alvara_task_checklist_progress.task_id
      and companies.user_id = auth.uid()
    )
  );

-- PROFILES: Admin vê tudo, user vê apenas o seu
drop policy if exists "users_manage_own_profile" on public.profiles;
create policy "users_view_all_profiles_admin" on public.profiles
  for select using (public.is_admin() or id = auth.uid());
create policy "users_update_own_profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

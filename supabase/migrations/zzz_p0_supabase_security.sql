-- P0 Supabase (OWASP/LGPD): RLS em todas as tabelas, catálogo com escrita restrita,
-- histórico por empresa, revogação anon e funções sem user_metadata.
-- Idempotente: pode reexecutar (DROP POLICY IF EXISTS antes de cada CREATE).

-- ---------------------------------------------------------------------------
-- Funções auxiliares (apenas auth.uid / profiles / is_admin — nunca user_metadata)
-- ---------------------------------------------------------------------------

create or replace function public.portal_has_edit(screen text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), (
    select
      coalesce(p.is_active, true)
      and (
        p.portal_permissions is null
        or coalesce(p.portal_permissions ->> screen, '') = 'edit'
      )
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

create or replace function public.user_can_access_company(company_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), exists (
    select 1
    from public.companies c
    where c.id = company_uuid
      and c.user_id = auth.uid()
  ), false);
$$;

grant execute on function public.portal_has_edit(text) to authenticated;
grant execute on function public.user_can_access_company(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS habilitado em todas as tabelas de aplicação (idempotente)
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.sync_config enable row level security;
alter table public.sync_logs enable row level security;
alter table public.profiles enable row level security;
alter table public.alvara_groups enable row level security;
alter table public.alvaras enable row level security;
alter table public.company_alvaras enable row level security;
alter table public.alvara_tasks enable row level security;
alter table public.alvara_task_history enable row level security;
alter table public.alvara_checklist_items enable row level security;
alter table public.alvara_task_checklist_progress enable row level security;
alter table public.company_history enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Revogar acesso anon à schema public (anon key não lê dados sem política explícita)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not like 'pg_%'
  loop
    execute format('revoke all on public.%I from anon', r.tablename);
  end loop;
end $$;

revoke all on schema public from anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- ---------------------------------------------------------------------------
-- company_history: isolamento por dono da empresa (substitui políticas amplas)
-- ---------------------------------------------------------------------------

drop policy if exists "auth_select_company_history" on public.company_history;
drop policy if exists "auth_insert_company_history" on public.company_history;
drop policy if exists "company_history_select" on public.company_history;
drop policy if exists "company_history_insert" on public.company_history;

create policy "company_history_select"
  on public.company_history
  for select
  to authenticated
  using (public.user_can_access_company(company_id));

create policy "company_history_insert"
  on public.company_history
  for insert
  to authenticated
  with check (public.user_can_access_company(company_id));

-- ---------------------------------------------------------------------------
-- Catálogo global: SELECT autenticado; escrita só com permissão de edição no portal
-- (substitui zzz_catalog_alvaras_write_rls — políticas authenticated_* abertas)
-- ---------------------------------------------------------------------------

drop policy if exists "authenticated_insert_alvaras" on public.alvaras;
drop policy if exists "authenticated_update_alvaras" on public.alvaras;
drop policy if exists "authenticated_delete_alvaras" on public.alvaras;
drop policy if exists "authenticated_insert_alvara_groups" on public.alvara_groups;
drop policy if exists "authenticated_update_alvara_groups" on public.alvara_groups;
drop policy if exists "authenticated_delete_alvara_groups" on public.alvara_groups;
drop policy if exists "authenticated_insert_alvara_checklist_items" on public.alvara_checklist_items;
drop policy if exists "authenticated_update_alvara_checklist_items" on public.alvara_checklist_items;
drop policy if exists "authenticated_delete_alvara_checklist_items" on public.alvara_checklist_items;

drop policy if exists "everyone_read_groups" on public.alvara_groups;
drop policy if exists "everyone_read_alvaras" on public.alvaras;
drop policy if exists "everyone_read_checklist_items" on public.alvara_checklist_items;

-- alvara_groups
drop policy if exists "alvara_groups_select" on public.alvara_groups;
drop policy if exists "alvara_groups_insert" on public.alvara_groups;
drop policy if exists "alvara_groups_update" on public.alvara_groups;
drop policy if exists "alvara_groups_delete" on public.alvara_groups;

create policy "alvara_groups_select"
  on public.alvara_groups for select to authenticated
  using (auth.role() = 'authenticated');

create policy "alvara_groups_insert"
  on public.alvara_groups for insert to authenticated
  with check (public.portal_has_edit('alvaras_grupos'));

create policy "alvara_groups_update"
  on public.alvara_groups for update to authenticated
  using (public.portal_has_edit('alvaras_grupos'))
  with check (public.portal_has_edit('alvaras_grupos'));

create policy "alvara_groups_delete"
  on public.alvara_groups for delete to authenticated
  using (public.portal_has_edit('alvaras_grupos'));

-- alvaras
drop policy if exists "alvaras_select" on public.alvaras;
drop policy if exists "alvaras_insert" on public.alvaras;
drop policy if exists "alvaras_update" on public.alvaras;
drop policy if exists "alvaras_delete" on public.alvaras;

create policy "alvaras_select"
  on public.alvaras for select to authenticated
  using (auth.role() = 'authenticated');

create policy "alvaras_insert"
  on public.alvaras for insert to authenticated
  with check (
    public.portal_has_edit('alvaras')
    or public.portal_has_edit('alvaras_importar')
    or public.portal_has_edit('alvaras_etapas')
  );

create policy "alvaras_update"
  on public.alvaras for update to authenticated
  using (
    public.portal_has_edit('alvaras')
    or public.portal_has_edit('alvaras_importar')
    or public.portal_has_edit('alvaras_etapas')
  )
  with check (
    public.portal_has_edit('alvaras')
    or public.portal_has_edit('alvaras_importar')
    or public.portal_has_edit('alvaras_etapas')
  );

create policy "alvaras_delete"
  on public.alvaras for delete to authenticated
  using (
    public.portal_has_edit('alvaras')
    or public.portal_has_edit('alvaras_importar')
    or public.portal_has_edit('alvaras_etapas')
  );

-- alvara_checklist_items
drop policy if exists "alvara_checklist_items_select" on public.alvara_checklist_items;
drop policy if exists "alvara_checklist_items_insert" on public.alvara_checklist_items;
drop policy if exists "alvara_checklist_items_update" on public.alvara_checklist_items;
drop policy if exists "alvara_checklist_items_delete" on public.alvara_checklist_items;

create policy "alvara_checklist_items_select"
  on public.alvara_checklist_items for select to authenticated
  using (auth.role() = 'authenticated');

create policy "alvara_checklist_items_insert"
  on public.alvara_checklist_items for insert to authenticated
  with check (public.portal_has_edit('alvaras_etapas'));

create policy "alvara_checklist_items_update"
  on public.alvara_checklist_items for update to authenticated
  using (public.portal_has_edit('alvaras_etapas'))
  with check (public.portal_has_edit('alvaras_etapas'));

create policy "alvara_checklist_items_delete"
  on public.alvara_checklist_items for delete to authenticated
  using (public.portal_has_edit('alvaras_etapas'));

-- ---------------------------------------------------------------------------
-- profiles: INSERT próprio (signup via trigger + fluxos SSR)
-- ---------------------------------------------------------------------------

drop policy if exists "users_insert_own_profile" on public.profiles;
create policy "users_insert_own_profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants mínimos para authenticated (RLS filtra linhas)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.company_alvaras to authenticated;
grant select, insert, update, delete on public.alvara_tasks to authenticated;
grant select, insert, update, delete on public.alvara_task_history to authenticated;
grant select, insert, update, delete on public.alvara_task_checklist_progress to authenticated;
grant select, insert, update, delete on public.alvara_groups to authenticated;
grant select, insert, update, delete on public.alvaras to authenticated;
grant select, insert, update, delete on public.alvara_checklist_items to authenticated;
grant select, insert on public.company_history to authenticated;
grant select, update on public.profiles to authenticated;
grant insert on public.profiles to authenticated;

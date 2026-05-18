-- P1 Supabase: RBAC (dono + responsável), políticas por operação em dados de tenant,
-- índices RLS, view com security_invoker, is_admin respeita is_active.

-- ---------------------------------------------------------------------------
-- Funções de acesso (sem user_metadata)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(is_active, true)
  );
end;
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
      and (
        c.user_id = auth.uid()
        or c.responsible_user_id = auth.uid()
      )
  ), false);
$$;

create or replace function public.user_owns_company(company_uuid uuid)
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

create or replace function public.user_can_access_company_alvara(company_alvara_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.user_can_access_company((
      select ca.company_id
      from public.company_alvaras ca
      where ca.id = company_alvara_uuid
    )),
    false
  );
$$;

create or replace function public.user_can_access_alvara_task(task_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.user_can_access_company_alvara((
      select t.company_alvara_id
      from public.alvara_tasks t
      where t.id = task_uuid
    )),
    false
  );
$$;

grant execute on function public.user_owns_company(uuid) to authenticated;
grant execute on function public.user_can_access_company_alvara(uuid) to authenticated;
grant execute on function public.user_can_access_alvara_task(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Índices para colunas usadas em políticas RLS
-- ---------------------------------------------------------------------------

create index if not exists idx_companies_user_id
  on public.companies (user_id);

create index if not exists idx_companies_user_responsible
  on public.companies (user_id, responsible_user_id);

create index if not exists idx_company_alvaras_company_id
  on public.company_alvaras (company_id);

create index if not exists idx_alvara_tasks_company_alvara_id
  on public.alvara_tasks (company_alvara_id);

create index if not exists idx_alvara_task_history_task_id
  on public.alvara_task_history (task_id);

create index if not exists idx_profiles_auth_lookup
  on public.profiles (id, role)
  where coalesce(is_active, true);

-- ---------------------------------------------------------------------------
-- companies: SELECT dono/responsável/admin; escrita só dono/admin
-- ---------------------------------------------------------------------------

drop policy if exists "users_manage_own_companies" on public.companies;

create policy "companies_select"
  on public.companies for select to authenticated
  using (
    public.is_admin()
    or user_id = auth.uid()
    or responsible_user_id = auth.uid()
  );

create policy "companies_insert"
  on public.companies for insert to authenticated
  with check (public.is_admin() or user_id = auth.uid());

create policy "companies_update"
  on public.companies for update to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

create policy "companies_delete"
  on public.companies for delete to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- company_alvaras
-- ---------------------------------------------------------------------------

drop policy if exists "users_manage_own_company_alvaras" on public.company_alvaras;

create policy "company_alvaras_select"
  on public.company_alvaras for select to authenticated
  using (public.user_can_access_company(company_id));

create policy "company_alvaras_insert"
  on public.company_alvaras for insert to authenticated
  with check (public.user_can_access_company(company_id));

create policy "company_alvaras_update"
  on public.company_alvaras for update to authenticated
  using (public.user_can_access_company(company_id))
  with check (public.user_can_access_company(company_id));

create policy "company_alvaras_delete"
  on public.company_alvaras for delete to authenticated
  using (public.user_can_access_company(company_id));

-- ---------------------------------------------------------------------------
-- alvara_tasks
-- ---------------------------------------------------------------------------

drop policy if exists "users_manage_own_alvara_tasks" on public.alvara_tasks;

create policy "alvara_tasks_select"
  on public.alvara_tasks for select to authenticated
  using (public.user_can_access_company_alvara(company_alvara_id));

create policy "alvara_tasks_insert"
  on public.alvara_tasks for insert to authenticated
  with check (public.user_can_access_company_alvara(company_alvara_id));

create policy "alvara_tasks_update"
  on public.alvara_tasks for update to authenticated
  using (public.user_can_access_company_alvara(company_alvara_id))
  with check (public.user_can_access_company_alvara(company_alvara_id));

create policy "alvara_tasks_delete"
  on public.alvara_tasks for delete to authenticated
  using (public.user_can_access_company_alvara(company_alvara_id));

-- ---------------------------------------------------------------------------
-- alvara_task_history
-- ---------------------------------------------------------------------------

drop policy if exists "users_manage_own_alvara_task_history" on public.alvara_task_history;

create policy "alvara_task_history_select"
  on public.alvara_task_history for select to authenticated
  using (public.user_can_access_alvara_task(task_id));

create policy "alvara_task_history_insert"
  on public.alvara_task_history for insert to authenticated
  with check (public.user_can_access_alvara_task(task_id));

create policy "alvara_task_history_update"
  on public.alvara_task_history for update to authenticated
  using (public.user_can_access_alvara_task(task_id))
  with check (public.user_can_access_alvara_task(task_id));

create policy "alvara_task_history_delete"
  on public.alvara_task_history for delete to authenticated
  using (public.user_can_access_alvara_task(task_id));

-- ---------------------------------------------------------------------------
-- alvara_task_checklist_progress
-- ---------------------------------------------------------------------------

drop policy if exists "users_manage_own_checklist_progress" on public.alvara_task_checklist_progress;

create policy "alvara_task_checklist_progress_select"
  on public.alvara_task_checklist_progress for select to authenticated
  using (public.user_can_access_alvara_task(task_id));

create policy "alvara_task_checklist_progress_insert"
  on public.alvara_task_checklist_progress for insert to authenticated
  with check (public.user_can_access_alvara_task(task_id));

create policy "alvara_task_checklist_progress_update"
  on public.alvara_task_checklist_progress for update to authenticated
  using (public.user_can_access_alvara_task(task_id))
  with check (public.user_can_access_alvara_task(task_id));

create policy "alvara_task_checklist_progress_delete"
  on public.alvara_task_checklist_progress for delete to authenticated
  using (public.user_can_access_alvara_task(task_id));

-- ---------------------------------------------------------------------------
-- View companies_alvara_summary com security_invoker (respeita RLS em companies)
-- ---------------------------------------------------------------------------

drop view if exists public.companies_alvara_summary;

create view public.companies_alvara_summary
with (security_invoker = true)
as
select
  c.id,
  c.archived_at,
  c.cadastro_tipo,
  c.codigo_empresa,
  c.numero_documento,
  c.cnpj,
  c.razao_social,
  c.nome_fantasia,
  c.situacao_cadastral,
  c.municipio,
  c.uf,
  c.atividade_principal,
  c.atividades_secundarias,
  trim(
    both ' ' from concat_ws(
      ' ',
      nullif(regexp_replace(coalesce(c.atividade_principal, ''), '\D', '', 'g'), ''),
      nullif(
        (
          select string_agg(
            nullif(regexp_replace(coalesce(elem->>'codigo', ''), '\D', '', 'g'), ''),
            ' '
          )
          from jsonb_array_elements(coalesce(c.atividades_secundarias, '[]'::jsonb)) as elem
        ),
        ''
      )
    )
  ) as cnaes_busca,
  c.last_sync_at,
  c.sync_status,
  c.updated_at,
  count(ca.id) as total_alvaras,
  count(ca.id) filter (where ca.status = 'emitido') as alvaras_emitidos,
  count(ca.id) filter (where ca.status = 'pendente') as alvaras_pendentes,
  count(ca.id) filter (where ca.status = 'vencido') as alvaras_vencidos,
  count(ca.id) filter (where ca.data_notificacao is not null) as alvaras_notificados
from public.companies c
left join public.company_alvaras ca on ca.company_id = c.id
group by c.id;

grant select on public.companies_alvara_summary to authenticated, service_role;

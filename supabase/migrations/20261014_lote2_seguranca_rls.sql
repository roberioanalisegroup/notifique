-- notifique: LOTE 2 de seguranca (auditoria de 14/10/2026)
-- Rode no SQL Editor do Supabase, UM PASSO POR VEZ (selecione o passo e clique Run).
-- Depois de cada passo, rode a consulta "CONFERIR" logo abaixo dele e me mande o resultado.
-- Desfazer: notifique-lote2-rls-DESFAZER.sql (na Area de Trabalho).
--
-- ORDEM:
--   Passos 1 a 9 podem ser aplicados JA (so restringem; admins nao sao afetados).
--   Passo 10 (corrige o "coalesce" e da acesso aos donos/responsaveis) SO DEPOIS
--   que o codigo do ramo seguranca/lote-1-codigo estiver no ar.

-- =====================================================================
-- PASSO 1: perfis nao-admin com permissao NULL viram mapa explicito
-- (NULL passa a significar "nenhum acesso"; hoje significa "edicao em tudo").
-- ANOTE os ids devolvidos: o arquivo DESFAZER precisa deles.
-- =====================================================================
update public.profiles
set portal_permissions = jsonb_build_object(
      'geracao_manutencao','edit', 'empresas_importar','edit', 'empresas_responsaveis','edit',
      'alvaras_importar','edit', 'alvaras_etapas','edit', 'alvaras_grupos','edit',
      'config_sync','edit', 'dashboard','edit', 'acompanhamento','edit',
      'empresas','edit', 'alvaras','edit'),
    updated_at = now()
where role <> 'admin' and portal_permissions is null
returning id, display_name;

-- CONFERIR 1 (esperado: 0)
select count(*) as nao_admin_com_null from public.profiles where role <> 'admin' and portal_permissions is null;


-- =====================================================================
-- PASSO 2: portal_has_edit sem o defeito do coalesce e com NULL = sem acesso
-- =====================================================================
create or replace function public.portal_has_edit(screen text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_admin() or coalesce((
    select coalesce(p.is_active, true)
       and coalesce(p.portal_permissions ->> screen, '') = 'edit'
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$function$;

-- CONFERIR 2
select pg_get_functiondef('public.portal_has_edit(text)'::regprocedure);


-- =====================================================================
-- PASSO 3: documentos oficiais e historico de documentos por empresa
-- (remove as politicas USING(true) "homologation_*")
-- =====================================================================
drop policy if exists homologation_documents_policy on public.company_alvara_documents;
drop policy if exists company_alvara_documents_select on public.company_alvara_documents;
drop policy if exists company_alvara_documents_insert on public.company_alvara_documents;
drop policy if exists company_alvara_documents_update on public.company_alvara_documents;

create policy company_alvara_documents_select on public.company_alvara_documents
  for select to authenticated
  using (public.user_can_access_company_alvara(company_alvara_id));
create policy company_alvara_documents_insert on public.company_alvara_documents
  for insert to authenticated
  with check (public.user_can_access_company_alvara(company_alvara_id) and public.portal_has_edit('acompanhamento'));
create policy company_alvara_documents_update on public.company_alvara_documents
  for update to authenticated
  using (public.user_can_access_company_alvara(company_alvara_id) and public.portal_has_edit('acompanhamento'))
  with check (public.user_can_access_company_alvara(company_alvara_id) and public.portal_has_edit('acompanhamento'));

drop policy if exists homologation_document_history_policy on public.company_alvara_document_history;
drop policy if exists company_alvara_document_history_select on public.company_alvara_document_history;
drop policy if exists company_alvara_document_history_insert on public.company_alvara_document_history;

create policy company_alvara_document_history_select on public.company_alvara_document_history
  for select to authenticated
  using (public.user_can_access_company_alvara(company_alvara_id));
create policy company_alvara_document_history_insert on public.company_alvara_document_history
  for insert to authenticated
  with check (public.user_can_access_company_alvara(company_alvara_id) and public.portal_has_edit('acompanhamento'));

-- CONFERIR 3 (esperado: nenhuma linha com using_expr = 'true')
select tablename, policyname, cmd, qual as using_expr, with_check
from pg_policies
where schemaname = 'public' and tablename in ('company_alvara_documents','company_alvara_document_history')
order by 1, 2;


-- =====================================================================
-- PASSO 4: historico de tarefas so por empresa, e sem alterar/apagar
-- (remove "auth_full_alvara_task_history" e "homologation_task_history_policy")
-- =====================================================================
drop policy if exists auth_full_alvara_task_history on public.alvara_task_history;
drop policy if exists homologation_task_history_policy on public.alvara_task_history;
drop policy if exists alvara_task_history_update on public.alvara_task_history;
drop policy if exists alvara_task_history_delete on public.alvara_task_history;
drop policy if exists alvara_task_history_insert on public.alvara_task_history;

create policy alvara_task_history_insert on public.alvara_task_history
  for insert to authenticated
  with check (public.user_can_access_alvara_task(task_id)
              and (public.portal_has_edit('acompanhamento') or public.portal_has_edit('geracao_manutencao')));

-- CONFERIR 4 (esperado: so alvara_task_history_select e alvara_task_history_insert)
select policyname, cmd, qual as using_expr, with_check
from pg_policies where schemaname = 'public' and tablename = 'alvara_task_history' order by 1;


-- =====================================================================
-- PASSO 5: gravar exige edicao na tela correspondente
-- (hoje a permissao "so leitura" vale so no Next; pelo PostgREST o dono grava)
-- =====================================================================
-- Tarefas: acompanhamento ou geracao/manutencao
drop policy if exists alvara_tasks_insert on public.alvara_tasks;
drop policy if exists alvara_tasks_update on public.alvara_tasks;
drop policy if exists alvara_tasks_delete on public.alvara_tasks;
create policy alvara_tasks_insert on public.alvara_tasks
  for insert to authenticated
  with check (public.user_can_access_company_alvara(company_alvara_id)
              and (public.portal_has_edit('acompanhamento') or public.portal_has_edit('geracao_manutencao')));
create policy alvara_tasks_update on public.alvara_tasks
  for update to authenticated
  using (public.user_can_access_company_alvara(company_alvara_id)
         and (public.portal_has_edit('acompanhamento') or public.portal_has_edit('geracao_manutencao')))
  with check (public.user_can_access_company_alvara(company_alvara_id)
              and (public.portal_has_edit('acompanhamento') or public.portal_has_edit('geracao_manutencao')));
create policy alvara_tasks_delete on public.alvara_tasks
  for delete to authenticated
  using (public.user_can_access_company_alvara(company_alvara_id)
         and (public.portal_has_edit('acompanhamento') or public.portal_has_edit('geracao_manutencao')));

-- Checklist da tarefa: acompanhamento
drop policy if exists alvara_task_checklist_progress_insert on public.alvara_task_checklist_progress;
drop policy if exists alvara_task_checklist_progress_update on public.alvara_task_checklist_progress;
drop policy if exists alvara_task_checklist_progress_delete on public.alvara_task_checklist_progress;
create policy alvara_task_checklist_progress_insert on public.alvara_task_checklist_progress
  for insert to authenticated
  with check (public.user_can_access_alvara_task(task_id) and public.portal_has_edit('acompanhamento'));
create policy alvara_task_checklist_progress_update on public.alvara_task_checklist_progress
  for update to authenticated
  using (public.user_can_access_alvara_task(task_id) and public.portal_has_edit('acompanhamento'))
  with check (public.user_can_access_alvara_task(task_id) and public.portal_has_edit('acompanhamento'));
create policy alvara_task_checklist_progress_delete on public.alvara_task_checklist_progress
  for delete to authenticated
  using (public.user_can_access_alvara_task(task_id) and public.portal_has_edit('acompanhamento'));

-- Vinculos empresa-alvara: acompanhamento (a geracao em lote tambem atualiza o vinculo)
drop policy if exists company_alvaras_insert on public.company_alvaras;
drop policy if exists company_alvaras_update on public.company_alvaras;
drop policy if exists company_alvaras_delete on public.company_alvaras;
create policy company_alvaras_insert on public.company_alvaras
  for insert to authenticated
  with check (public.user_can_access_company(company_id) and public.portal_has_edit('acompanhamento'));
create policy company_alvaras_update on public.company_alvaras
  for update to authenticated
  using (public.user_can_access_company(company_id)
         and (public.portal_has_edit('acompanhamento') or public.portal_has_edit('geracao_manutencao')))
  with check (public.user_can_access_company(company_id)
              and (public.portal_has_edit('acompanhamento') or public.portal_has_edit('geracao_manutencao')));
create policy company_alvaras_delete on public.company_alvaras
  for delete to authenticated
  using (public.user_can_access_company(company_id) and public.portal_has_edit('acompanhamento'));

-- Empresas: dono com edicao em empresas / importar / responsaveis
drop policy if exists companies_insert on public.companies;
drop policy if exists companies_update on public.companies;
create policy companies_insert on public.companies
  for insert to authenticated
  with check (public.is_admin()
              or (user_id = auth.uid()
                  and (public.portal_has_edit('empresas') or public.portal_has_edit('empresas_importar'))));
create policy companies_update on public.companies
  for update to authenticated
  using (public.is_admin()
         or (user_id = auth.uid()
             and (public.portal_has_edit('empresas') or public.portal_has_edit('empresas_importar')
                  or public.portal_has_edit('empresas_responsaveis'))))
  with check (public.is_admin()
              or (user_id = auth.uid()
                  and (public.portal_has_edit('empresas') or public.portal_has_edit('empresas_importar')
                       or public.portal_has_edit('empresas_responsaveis'))));

-- CONFERIR 5
select tablename, policyname, cmd, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('alvara_tasks','alvara_task_checklist_progress','company_alvaras','companies')
order by 1, 2;


-- =====================================================================
-- PASSO 6: grupos do catalogo (remove "auth_full" de alvara_group_links)
-- =====================================================================
drop policy if exists auth_full on public.alvara_group_links;
drop policy if exists alvara_group_links_select on public.alvara_group_links;
drop policy if exists alvara_group_links_insert on public.alvara_group_links;
drop policy if exists alvara_group_links_update on public.alvara_group_links;
drop policy if exists alvara_group_links_delete on public.alvara_group_links;
create policy alvara_group_links_select on public.alvara_group_links
  for select to authenticated using (true);
create policy alvara_group_links_insert on public.alvara_group_links
  for insert to authenticated with check (public.portal_has_edit('alvaras'));
create policy alvara_group_links_update on public.alvara_group_links
  for update to authenticated
  using (public.portal_has_edit('alvaras')) with check (public.portal_has_edit('alvaras'));
create policy alvara_group_links_delete on public.alvara_group_links
  for delete to authenticated using (public.portal_has_edit('alvaras'));

-- CONFERIR 6
select policyname, cmd, qual as using_expr, with_check
from pg_policies where schemaname = 'public' and tablename = 'alvara_group_links' order by 1;


-- =====================================================================
-- PASSO 7: o proprio usuario so cria o perfil como 'user', sem permissoes
-- =====================================================================
drop policy if exists users_insert_own_profile on public.profiles;
create policy users_insert_own_profile on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and coalesce(role, 'user') = 'user' and portal_permissions is null);

-- CONFERIR 7
select policyname, cmd, with_check from pg_policies
where schemaname = 'public' and tablename = 'profiles' and policyname = 'users_insert_own_profile';


-- =====================================================================
-- PASSO 8: travas de ciclo de vida no banco (valem tambem pelo PostgREST)
--   - tarefa concluida/cancelada nao muda nem e apagada (so admin reabre)
--   - vinculo arquivado/suspenso ou empresa arquivada congela tarefas e checklist
--   - so admin arquiva/suspende vinculo
-- Admins e a service role (auth.uid() nulo) passam.
-- =====================================================================
create or replace function public.guard_alvara_task_lifecycle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_link uuid;
  v_arch timestamptz;
  v_mon text;
  v_carch timestamptz;
begin
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.status in ('concluida', 'cancelada') then
    raise exception 'Tarefa encerrada (concluida ou cancelada) nao pode ser alterada.';
  end if;

  if tg_op = 'DELETE' then
    v_link := old.company_alvara_id;
  else
    v_link := new.company_alvara_id;
  end if;

  select ca.archived_at, ca.monitoring_status, c.archived_at
    into v_arch, v_mon, v_carch
  from public.company_alvaras ca
  join public.companies c on c.id = ca.company_id
  where ca.id = v_link;

  if v_arch is not null or v_mon = 'suspenso' or v_carch is not null then
    raise exception 'Vinculo arquivado ou suspenso, ou empresa arquivada: a tarefa nao pode ser alterada.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_alvara_task_lifecycle on public.alvara_tasks;
create trigger trg_guard_alvara_task_lifecycle
  before insert or update or delete on public.alvara_tasks
  for each row execute function public.guard_alvara_task_lifecycle();

create or replace function public.guard_checklist_progress_lifecycle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task uuid;
  v_status text;
  v_arch timestamptz;
  v_mon text;
  v_carch timestamptz;
begin
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_task := old.task_id;
  else
    v_task := new.task_id;
  end if;

  select t.status, ca.archived_at, ca.monitoring_status, c.archived_at
    into v_status, v_arch, v_mon, v_carch
  from public.alvara_tasks t
  join public.company_alvaras ca on ca.id = t.company_alvara_id
  join public.companies c on c.id = ca.company_id
  where t.id = v_task;

  if v_status in ('concluida', 'cancelada') then
    raise exception 'Tarefa encerrada: o checklist nao pode ser alterado.';
  end if;
  if v_arch is not null or v_mon = 'suspenso' or v_carch is not null then
    raise exception 'Vinculo arquivado ou suspenso, ou empresa arquivada: o checklist nao pode ser alterado.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_checklist_progress_lifecycle on public.alvara_task_checklist_progress;
create trigger trg_guard_checklist_progress_lifecycle
  before insert or update or delete on public.alvara_task_checklist_progress
  for each row execute function public.guard_checklist_progress_lifecycle();

create or replace function public.guard_company_alvara_lifecycle_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.archived_at is distinct from old.archived_at
     or new.monitoring_status is distinct from old.monitoring_status then
    raise exception 'Arquivar ou suspender o vinculo e exclusivo do administrador.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_company_alvara_lifecycle_fields on public.company_alvaras;
create trigger trg_guard_company_alvara_lifecycle_fields
  before update on public.company_alvaras
  for each row execute function public.guard_company_alvara_lifecycle_fields();

revoke all on function public.guard_alvara_task_lifecycle() from public, anon, authenticated;
revoke all on function public.guard_checklist_progress_lifecycle() from public, anon, authenticated;
revoke all on function public.guard_company_alvara_lifecycle_fields() from public, anon, authenticated;

-- CONFERIR 8 (esperado: os 3 triggers trg_guard_*)
select c.relname as tabela, t.tgname
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and t.tgname like 'trg_guard_%'
order by 1, 2;


-- =====================================================================
-- PASSO 9: funcao para derrubar as sessoes de um usuario (so a service role chama)
-- O portal chama depois de trocar senha/e-mail ou desativar a conta.
-- =====================================================================
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language sql
security definer
set search_path to ''
as $function$
  delete from auth.sessions where user_id = p_user_id;
$function$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- CONFERIR 9 (deve rodar sem erro; o id zero nao existe, nada e apagado)
select public.revoke_user_sessions('00000000-0000-0000-0000-000000000000');
select has_function_privilege('authenticated', 'public.revoke_user_sessions(uuid)', 'execute') as authenticated_pode; -- esperado: false


-- =====================================================================
-- PASSO 10 (SO DEPOIS DO CODIGO NO AR): donos e responsaveis passam na RLS
-- Corrige o coalesce: hoje is_admin() = false encerra a avaliacao e ninguem
-- alem dos admins enxerga vinculos, tarefas e historico das proprias empresas.
-- =====================================================================
create or replace function public.user_can_access_company(company_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_admin() or exists (
    select 1
    from public.companies c
    where c.id = company_uuid
      and (c.user_id = auth.uid() or c.responsible_user_id = auth.uid())
  );
$function$;

create or replace function public.user_owns_company(company_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_admin() or exists (
    select 1
    from public.companies c
    where c.id = company_uuid
      and c.user_id = auth.uid()
  );
$function$;

-- CONFERIR 10
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname in ('user_can_access_company','user_owns_company');

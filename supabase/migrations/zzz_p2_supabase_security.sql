-- P2: triggers de auditoria em tabelas críticas, privilégios de coluna (sem raw_data via JWT)
-- e endurecimento de funções auxiliares.

-- ---------------------------------------------------------------------------
-- Auditoria em BD (SECURITY DEFINER — contorna audit_logs_no_write para authenticated)
-- Metadados mínimos (sem PII / sem row completo).
-- ---------------------------------------------------------------------------

create or replace function public.audit_log_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rid text;
  meta jsonb;
  changed jsonb;
begin
  rid := coalesce(
    to_jsonb(NEW) ->> 'id',
    to_jsonb(OLD) ->> 'id',
    null
  );

  meta := jsonb_build_object(
    'schema', TG_TABLE_SCHEMA,
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'record_id', rid
  );

  if TG_OP = 'UPDATE' and NEW is not null and OLD is not null then
    select coalesce(jsonb_agg(n.key), '[]'::jsonb)
    into changed
    from jsonb_each(to_jsonb(NEW)) as n(key, value)
    join jsonb_each(to_jsonb(OLD)) as o(key, value) on n.key = o.key
    where n.value is distinct from o.value
      and n.key not in ('updated_at', 'last_sync_at');

    meta := meta || jsonb_build_object('changed_columns', changed);
  end if;

  insert into public.audit_logs (event_type, actor_user_id, metadata)
  values (
    'db.' || TG_TABLE_NAME || '.' || lower(TG_OP),
    auth.uid(),
    meta
  );

  return coalesce(NEW, OLD);
end;
$$;

-- companies
drop trigger if exists trg_audit_companies on public.companies;
create trigger trg_audit_companies
  after insert or update or delete on public.companies
  for each row execute function public.audit_log_table_change();

-- company_alvaras
drop trigger if exists trg_audit_company_alvaras on public.company_alvaras;
create trigger trg_audit_company_alvaras
  after insert or update or delete on public.company_alvaras
  for each row execute function public.audit_log_table_change();

-- alvara_tasks
drop trigger if exists trg_audit_alvara_tasks on public.alvara_tasks;
create trigger trg_audit_alvara_tasks
  after insert or update or delete on public.alvara_tasks
  for each row execute function public.audit_log_table_change();

-- catálogo alvaras
drop trigger if exists trg_audit_alvaras on public.alvaras;
create trigger trg_audit_alvaras
  after insert or update or delete on public.alvaras
  for each row execute function public.audit_log_table_change();

-- perfis (alterações; criação via handle_new_user)
drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after update or delete on public.profiles
  for each row execute function public.audit_log_table_change();

-- sync (admin)
drop trigger if exists trg_audit_sync_config on public.sync_config;
create trigger trg_audit_sync_config
  after update on public.sync_config
  for each row execute function public.audit_log_table_change();

-- ---------------------------------------------------------------------------
-- Privilégio mínimo de colunas: raw_data só via service_role (sync BrasilAPI)
-- ---------------------------------------------------------------------------

revoke all on table public.companies from authenticated;

grant select (
  id,
  cadastro_tipo,
  numero_documento,
  cnpj,
  codigo_empresa,
  razao_social,
  nome_fantasia,
  situacao_cadastral,
  data_situacao,
  natureza_juridica,
  atividade_principal,
  atividades_secundarias,
  logradouro,
  numero,
  complemento,
  bairro,
  municipio,
  uf,
  cep,
  telefone,
  email,
  capital_social,
  porte,
  opcao_simples,
  opcao_mei,
  data_abertura,
  last_sync_at,
  sync_status,
  sync_error,
  created_at,
  updated_at,
  archived_at,
  user_id,
  responsible_user_id
) on public.companies to authenticated;

grant insert, update, delete on public.companies to authenticated;

comment on column public.companies.raw_data is
  'JSON BrasilAPI; leitura/escrita apenas service_role. Utilizadores autenticados não têm GRANT SELECT nesta coluna.';

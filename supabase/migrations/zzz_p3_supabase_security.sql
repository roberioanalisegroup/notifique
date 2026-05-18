-- P3: pseudonimização para relatórios, extensão pgcrypto e role de leitura restrita.

create extension if not exists pgcrypto;

-- Hash irreversível de documento para agregações (definir app.analytics_salt na sessão do job)
create or replace function public.hash_documento_for_analytics(doc text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select encode(
    digest(
      coalesce(doc, '') || coalesce(current_setting('app.analytics_salt', true), 'notifique-analytics'),
      'sha256'
    ),
    'hex'
  );
$$;

comment on function public.hash_documento_for_analytics(text) is
  'Pseudonimização LGPD: use app.analytics_salt via SET app.analytics_salt no job de relatório.';

revoke all on function public.hash_documento_for_analytics(text) from public;
grant execute on function public.hash_documento_for_analytics(text) to authenticated, service_role;

-- Relatório agregado sem PII (security_invoker = respeita RLS em companies)
drop view if exists public.companies_analytics_monthly;

create view public.companies_analytics_monthly
with (security_invoker = true)
as
select
  date_trunc('month', c.created_at) as mes_cadastro,
  c.uf,
  c.situacao_cadastral,
  count(*)::bigint as total_empresas,
  count(*) filter (where c.archived_at is null)::bigint as ativas,
  count(*) filter (where c.archived_at is not null)::bigint as arquivadas
from public.companies c
group by 1, 2, 3;

grant select on public.companies_analytics_monthly to authenticated, service_role;

-- Role opcional para BI (somente views agregadas + summary)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'notifique_readonly') then
    create role notifique_readonly nologin;
  end if;
end $$;

grant usage on schema public to notifique_readonly;
grant select on public.companies_alvara_summary to notifique_readonly;
grant select on public.companies_analytics_monthly to notifique_readonly;

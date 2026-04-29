-- Código interno manual por empresa (listagem, busca, ordenação).
alter table public.companies
  add column if not exists codigo_empresa text null;

comment on column public.companies.codigo_empresa is 'Código da empresa definido manualmente; pesquisável na listagem.';

create index if not exists idx_companies_codigo_empresa_lower
  on public.companies (lower(trim(codigo_empresa)))
  where codigo_empresa is not null and trim(codigo_empresa) <> '';

drop view if exists public.companies_alvara_summary;

create view public.companies_alvara_summary as
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

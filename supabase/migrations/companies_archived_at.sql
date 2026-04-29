-- Soft archive: empresa permanece para histórico; listagem usa archived_at IS NULL por defeito.

alter table public.companies
  add column if not exists archived_at timestamptz null;

comment on column public.companies.archived_at is 'Preenchido ao arquivar; null = empresa ativa na listagem principal.';

create index if not exists idx_companies_archived_at on public.companies (archived_at);

drop view if exists public.companies_alvara_summary;

create view public.companies_alvara_summary as
select
  c.id,
  c.archived_at,
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

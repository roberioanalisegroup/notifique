-- Corrige erro: column companies_alvara_summary.numero_documento does not exist
-- (view antiga sem cadastro_tipo/numero_documento). Idempotente.

alter table public.companies
  add column if not exists cadastro_tipo text not null default 'cnpj';

alter table public.companies
  add column if not exists numero_documento text;

update public.companies
set numero_documento = regexp_replace(cnpj, '\D', '', 'g')
where numero_documento is null and cnpj is not null;

alter table public.companies drop constraint if exists companies_cadastro_tipo_check;

alter table public.companies
  add constraint companies_cadastro_tipo_check
  check (cadastro_tipo in ('cnpj', 'mei', 'caepf', 'cpf', 'outros'));

-- Garantir NOT NULL em numero_documento quando possível
do $$
begin
  if not exists (select 1 from public.companies where numero_documento is null) then
    alter table public.companies alter column numero_documento set not null;
  end if;
end $$;

create unique index if not exists idx_companies_numero_documento
  on public.companies (numero_documento);

drop view if exists public.companies_alvara_summary;

create view public.companies_alvara_summary as
select
  c.id,
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

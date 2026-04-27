-- Tipos de cadastro (CNPJ, MEI, CAEPF, CPF, outros) + identificador único numérico.
-- cnpj fica espelhado quando há 14 dígitos (consulta BrasilAPI); null para CPF-only.

alter table public.companies
  add column if not exists cadastro_tipo text not null default 'cnpj';

alter table public.companies
  add column if not exists numero_documento text;

update public.companies
set numero_documento = regexp_replace(cnpj, '\D', '', 'g')
where numero_documento is null and cnpj is not null;

alter table public.companies alter column numero_documento set not null;

alter table public.companies drop constraint if exists companies_cadastro_tipo_check;

alter table public.companies
  add constraint companies_cadastro_tipo_check
  check (cadastro_tipo in ('cnpj', 'mei', 'caepf', 'cpf', 'outros'));

alter table public.companies drop constraint if exists companies_cnpj_key;

alter table public.companies alter column cnpj drop not null;

create unique index if not exists idx_companies_numero_documento
  on public.companies (numero_documento);

update public.companies
set cnpj = numero_documento
where length(numero_documento) = 14;

comment on column public.companies.cadastro_tipo is 'cnpj | mei | caepf | cpf | outros';
comment on column public.companies.numero_documento is 'Apenas dígitos; chave única do cadastro';
comment on column public.companies.cnpj is '14 dígitos quando PJ/MEI/CAEPF com consulta; null se só CPF';

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

-- Responsável pela empresa (perfil/colaborador), visível em acompanhamento.

alter table public.companies drop constraint if exists companies_responsible_user_id_fkey;
alter table public.companies add column if not exists responsible_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    where rel.relname = 'companies' and c.conname = 'companies_responsible_user_id_fkey'
  ) then
    alter table public.companies
      add constraint companies_responsible_user_id_fkey
      foreign key (responsible_user_id) references public.profiles (id) on delete set null;
  end if;
end $$;

create index if not exists idx_companies_responsible_user_id
  on public.companies (responsible_user_id)
  where responsible_user_id is not null;

-- Quem vê uma empresa pode ver o perfil mínimo do responsável embutido em consultas PostgREST.
drop policy if exists "profiles_select_via_company_responsible" on public.profiles;
create policy "profiles_select_via_company_responsible" on public.profiles
  for select using (
    exists (
      select 1 from public.companies c
      where c.responsible_user_id = profiles.id
        and (
          public.is_admin()
          or c.user_id = auth.uid()
        )
    )
  );

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
  c.atividade_principal,
  c.atividades_secundarias,
  c.responsible_user_id,
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
  count(ca.id)                                              as total_alvaras,
  count(ca.id) filter (where ca.status = 'emitido')        as alvaras_emitidos,
  count(ca.id) filter (where ca.status = 'pendente')       as alvaras_pendentes,
  count(ca.id) filter (where ca.status = 'vencido')        as alvaras_vencidos,
  count(ca.id) filter (where ca.data_notificacao is not null) as alvaras_notificados
from public.companies c
left join public.company_alvaras ca on ca.company_id = c.id
group by c.id;

grant select on public.companies_alvara_summary to authenticated, service_role;

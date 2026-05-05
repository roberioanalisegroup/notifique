-- CNAE: colunas para listagem/filtro (atividade principal + secundárias agregadas em texto).
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

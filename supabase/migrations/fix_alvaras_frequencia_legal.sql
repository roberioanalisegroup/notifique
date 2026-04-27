-- Corrige schema de public.alvaras para a app atual:
-- frequencia, weekend_adjust, colunas legal_* e remoção de validade_meses.
-- Seguro para correr mais de uma vez (idempotente na medida do possível).

-- 1) Colunas principais
alter table public.alvaras add column if not exists frequencia text;
alter table public.alvaras add column if not exists weekend_adjust text;

-- 2) Preencher frequência a partir de validade_meses, se essa coluna ainda existir
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'alvaras'
      and column_name = 'validade_meses'
  ) then
    update public.alvaras
    set frequencia = case validade_meses
      when 1 then 'mensal'
      when 2 then 'bimestral'
      when 3 then 'trimestral'
      when 6 then 'semestral'
      when 12 then 'anual'
      else 'mensal'
    end
    where frequencia is null;
  end if;
end $$;

update public.alvaras set frequencia = 'mensal' where frequencia is null;
update public.alvaras set weekend_adjust = 'none' where weekend_adjust is null;

alter table public.alvaras alter column frequencia set not null;
alter table public.alvaras alter column weekend_adjust set not null;

alter table public.alvaras drop column if exists validade_meses;

alter table public.alvaras drop constraint if exists alvaras_frequencia_check;
alter table public.alvaras add constraint alvaras_frequencia_check
  check (frequencia in (
    'diaria', 'semanal', 'decendial', 'mensal', 'bimestral',
    'trimestral', 'semestral', 'anual'
  ));

alter table public.alvaras drop constraint if exists alvaras_weekend_adjust_check;
alter table public.alvaras add constraint alvaras_weekend_adjust_check
  check (weekend_adjust in ('none', 'postpone', 'anticipate'));

-- 3) Data legal
alter table public.alvaras add column if not exists legal_dia smallint;
alter table public.alvaras add column if not exists legal_mes smallint;
alter table public.alvaras add column if not exists legal_dia_semana smallint;
alter table public.alvaras add column if not exists legal_dias_uteis smallint;

alter table public.alvaras drop constraint if exists alvaras_legal_dia_check;
alter table public.alvaras add constraint alvaras_legal_dia_check
  check (legal_dia is null or (legal_dia >= 1 and legal_dia <= 31));

alter table public.alvaras drop constraint if exists alvaras_legal_mes_check;
alter table public.alvaras add constraint alvaras_legal_mes_check
  check (legal_mes is null or (legal_mes >= 1 and legal_mes <= 12));

alter table public.alvaras drop constraint if exists alvaras_legal_dia_semana_check;
alter table public.alvaras add constraint alvaras_legal_dia_semana_check
  check (legal_dia_semana is null or (legal_dia_semana >= 0 and legal_dia_semana <= 6));

alter table public.alvaras drop constraint if exists alvaras_legal_dias_uteis_check;
alter table public.alvaras add constraint alvaras_legal_dias_uteis_check
  check (legal_dias_uteis is null or (legal_dias_uteis >= 0 and legal_dias_uteis <= 60));

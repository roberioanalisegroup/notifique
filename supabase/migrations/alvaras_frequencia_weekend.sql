-- Tipos de alvará: frequência em vez de validade_meses; ajuste de fim de semana

alter table public.alvaras add column if not exists frequencia text;
alter table public.alvaras add column if not exists weekend_adjust text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'alvaras' and column_name = 'validade_meses'
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

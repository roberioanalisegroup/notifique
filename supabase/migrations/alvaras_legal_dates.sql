-- Data legal por frequência (dia/mês, dia da semana, decendial, etc.)

alter table public.alvaras add column if not exists legal_dia smallint;
alter table public.alvaras add column if not exists legal_mes smallint;
alter table public.alvaras add column if not exists legal_dia_semana smallint;
alter table public.alvaras add column if not exists legal_dias_uteis smallint;

comment on column public.alvaras.legal_dia is 'Dia do mês (1–31): mensal, ciclos, anual, decendial (dia inicial)';
comment on column public.alvaras.legal_mes is 'Mês (1–12): anual, bimestral, trimestral, semestral';
comment on column public.alvaras.legal_dia_semana is '0=domingo … 6=sábado: semanal';
comment on column public.alvaras.legal_dias_uteis is 'Dias úteis somados após o dia inicial: decendial';

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

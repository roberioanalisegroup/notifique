-- Prazo para iniciar tarefa no 1.º ciclo (dias após criação da tarefa) + data limite por tarefa
alter table public.alvaras
  add column if not exists prazo_inicio_dias smallint not null default 30
  check (prazo_inicio_dias >= 1 and prazo_inicio_dias <= 3650);

alter table public.alvara_tasks
  add column if not exists inicio_obrigatorio_ate date;

comment on column public.alvaras.prazo_inicio_dias is 'Dias corridos após criação da tarefa (1.º ciclo) para mover de Pendente a Em andamento.';
comment on column public.alvara_tasks.inicio_obrigatorio_ate is 'Só no 1.º ciclo: último dia para iniciar; ciclos seguintes ficam null.';

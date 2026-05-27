-- Adiciona a coluna protocolo na tabela alvara_tasks
alter table public.alvara_tasks
  add column if not exists protocolo text null;

comment on column public.alvara_tasks.protocolo is 'Número de protocolo do processo de renovação/emissão do alvará';

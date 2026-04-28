-- Se verdadeiro, a conclusão da tarefa exige arquivo_url no vínculo empresa–alvará.
alter table public.alvaras
  add column if not exists anexo_obrigatorio boolean not null default false;

comment on column public.alvaras.anexo_obrigatorio is
  'Quando verdadeiro, não é permitido concluir a tarefa sem documento anexado ao vínculo.';

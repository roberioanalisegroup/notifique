-- Configuração de checklist por tipo de alvará: template associado e obrigatoriedade na conclusão.

alter table public.alvaras
  add column if not exists checklist_template_id uuid
    references public.alvara_checklist_templates(id) on delete set null,
  add column if not exists checklist_obrigatorio boolean not null default false;

create index if not exists idx_alvaras_checklist_template
  on public.alvaras (checklist_template_id)
  where checklist_template_id is not null;

comment on column public.alvaras.checklist_template_id is
  'Template de etapas preferido (criado pelo utilizador); referência para reaplicar.';
comment on column public.alvaras.checklist_obrigatorio is
  'Se true, todas as etapas da checklist devem estar concluídas para concluir a tarefa.';

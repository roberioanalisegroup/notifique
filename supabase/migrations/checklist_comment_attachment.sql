-- Adiciona campos de comentário e anexo ao progresso da checklist
-- e amplia o check do event_type do histórico para incluir 'checklist'

alter table public.alvara_task_checklist_progress
  add column if not exists comment text,
  add column if not exists attachment_url text,
  add column if not exists completed_at timestamptz;

-- Ampliar check do alvara_task_history para aceitar 'checklist'
alter table public.alvara_task_history
  drop constraint if exists alvara_task_history_event_type_check;

alter table public.alvara_task_history
  add constraint alvara_task_history_event_type_check
  check (event_type in ('created', 'status', 'notes', 'attachment', 'due_date', 'system', 'checklist'));

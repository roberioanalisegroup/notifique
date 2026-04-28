-- Histórico de eventos por tarefa (status, notas, anexos, etc.)
create table if not exists public.alvara_task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.alvara_tasks(id) on delete cascade,
  event_type text not null
    check (event_type in ('created', 'status', 'notes', 'attachment', 'due_date', 'system')),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_alvara_task_history_task
  on public.alvara_task_history (task_id, created_at desc);

alter table public.alvara_task_history enable row level security;

create policy "auth_full_alvara_task_history"
  on public.alvara_task_history
  for all
  using (auth.role() = 'authenticated');

create or replace function public.alvara_task_log_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.alvara_task_history (task_id, event_type, summary, metadata)
  values (
    new.id,
    'created',
    'Tarefa criada',
    jsonb_build_object(
      'due_date', new.due_date::text,
      'status', new.status
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_alvara_task_created_hist on public.alvara_tasks;
create trigger trg_alvara_task_created_hist
  after insert on public.alvara_tasks
  for each row execute function public.alvara_task_log_created();

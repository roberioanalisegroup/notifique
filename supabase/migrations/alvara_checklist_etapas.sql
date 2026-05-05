-- Etapas (checklist) por tipo de alvará + progresso por tarefa no acompanhamento.
create table public.alvara_checklist_items (
  id uuid primary key default gen_random_uuid(),
  alvara_id uuid not null references public.alvaras(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_alvara_checklist_items_alvara on public.alvara_checklist_items (alvara_id, sort_order);

create table public.alvara_task_checklist_progress (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.alvara_tasks(id) on delete cascade,
  item_id uuid not null references public.alvara_checklist_items(id) on delete cascade,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (task_id, item_id)
);

create index idx_alvara_task_checklist_task on public.alvara_task_checklist_progress (task_id);

create trigger trg_alvara_checklist_items_upd
  before update on public.alvara_checklist_items
  for each row execute function public.set_updated_at();

create trigger trg_alvara_task_checklist_progress_upd
  before update on public.alvara_task_checklist_progress
  for each row execute function public.set_updated_at();

alter table public.alvara_checklist_items enable row level security;
alter table public.alvara_task_checklist_progress enable row level security;

create policy "auth_full" on public.alvara_checklist_items for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.alvara_task_checklist_progress for all using (auth.role() = 'authenticated');

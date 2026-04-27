-- Tarefas de acompanhamento (geradas por janela, ex. 30 dias) por vínculo empresa–alvará
create table if not exists public.alvara_tasks (
  id                    uuid primary key default gen_random_uuid(),
  company_alvara_id     uuid not null references public.company_alvaras(id) on delete cascade,
  due_date              date not null,
  status                text not null default 'pendente'
    check (status in ('pendente', 'concluida', 'cancelada')),
  title                 text,
  completed_at          timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_alvara_id, due_date)
);

create index if not exists idx_alvara_tasks_due
  on public.alvara_tasks (due_date) where status = 'pendente';
create index if not exists idx_alvara_tasks_ca
  on public.alvara_tasks (company_alvara_id);

drop trigger if exists trg_alvara_tasks_upd on public.alvara_tasks;
create trigger trg_alvara_tasks_upd
  before update on public.alvara_tasks
  for each row execute function public.set_updated_at();

alter table public.alvara_tasks enable row level security;

create policy "auth_full" on public.alvara_tasks
  for all using (auth.role() = 'authenticated');

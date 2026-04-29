-- Histórico de eventos por empresa (cadastro, vínculos, arquivamento)
create table if not exists public.company_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  event_type text not null
    check (
      event_type in (
        'cadastro_sync',
        'arquivamento',
        'restauracao',
        'tarefa_vinculada',
        'tarefa_desvinculada',
        'tarefa_atualizada'
      )
    ),
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_history_company
  on public.company_history (company_id, created_at desc);

alter table public.company_history enable row level security;

create policy "auth_select_company_history"
  on public.company_history for select
  using (auth.role() = 'authenticated');

create policy "auth_insert_company_history"
  on public.company_history for insert
  with check (auth.role() = 'authenticated');

grant select, insert on public.company_history to authenticated;
grant select, insert, update, delete on public.company_history to service_role;

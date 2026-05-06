-- Tabela de auditoria para ações administrativas e eventos de segurança.
-- Leitura restrita a administradores; inserções apenas via service role.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  actor_user_id uuid null references auth.users(id),
  actor_email text null,
  ip text null,
  user_agent text null,
  request_id text null,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs
  for select using (public.is_admin());

-- Não permitir escrita via cliente (authenticated).
drop policy if exists "audit_logs_no_write" on public.audit_logs;
create policy "audit_logs_no_write" on public.audit_logs
  for all using (false) with check (false);


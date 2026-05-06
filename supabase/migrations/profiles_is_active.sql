-- Estado do utilizador no portal (complementar ao Auth: inativos são banidos via API admin).

alter table public.profiles add column if not exists is_active boolean not null default true;

create index if not exists profiles_role_active_idx on public.profiles (role) where role = 'admin' and is_active = true;

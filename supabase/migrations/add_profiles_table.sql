-- Executar no Supabase: SQL Editor → New query → colar tudo → Run
-- Cria public.profiles e o trigger no Auth. Seguro a repetir (IF NOT EXISTS / ON CONFLICT).

-- 1) Tabela
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2) Atualizar updated_at (função padrão do projeto; substitui se já existir)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profiles_upd on public.profiles;
create trigger trg_profiles_upd
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 3) Novo utilizador no Auth → linha em profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Contas que já existiam
insert into public.profiles (id, display_name)
select
  id,
  coalesce(
    raw_user_meta_data->>'display_name',
    raw_user_meta_data->>'full_name',
    split_part(coalesce(email, ''), '@', 1)
  )
from auth.users
on conflict (id) do nothing;

-- 5) RLS (sem policy = acesso com JWT de utilizador negado; a app usa a API com service role)
alter table public.profiles enable row level security;

-- Após correr, recarregar a app ou esperar ~1 min se o “schema cache” ainda se queixar.

-- Migration: 20260602_lifecycle_errors_security.sql
-- Objetivo: RLS Lockdown e isolamento total da tabela public.lifecycle_errors,
-- garantindo que apenas o service_role do Supabase acesse-a via backend.

-- 1. Revogar todas as permissões concedidas a anon e authenticated
revoke all on public.lifecycle_errors from anon;
revoke all on public.lifecycle_errors from authenticated;

-- 2. Garantir permissões completas para o service_role
grant all on public.lifecycle_errors to service_role;

-- 3. Ativar RLS (Row Level Security) e FORCE RLS para super-utilizadores/dono se aplicável
alter table public.lifecycle_errors enable row level security;
alter table public.lifecycle_errors force row level security;

-- 4. Criar a política de segurança de Lockdown absoluto para a tabela public.lifecycle_errors
drop policy if exists "homologation_errors_policy" on public.lifecycle_errors;
drop policy if exists "lifecycle_errors_no_public" on public.lifecycle_errors;

create policy "lifecycle_errors_no_public"
on public.lifecycle_errors
for all
to public
using (false)
with check (false);

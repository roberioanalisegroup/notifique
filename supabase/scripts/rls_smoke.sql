-- P3: testes manuais de RLS (executar no SQL Editor — NÃO como postgres superuser isolado).
-- Preferir Supabase Studio → Authentication → impersonate user.

-- Utilizador A (substituir UUIDs)
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<uuid-user-a>","role":"authenticated"}';

-- 1) Utilizador comum não deve ver empresas de outro dono
-- select id, razao_social from public.companies limit 20;

-- 2) Não deve ler raw_data (coluna sem grant)
-- select raw_data from public.companies limit 1;  -- esperado: permission denied

-- 3) Admin impersonado vê audit_logs
-- select count(*) from public.audit_logs;

-- 4) View summary respeita RLS (security_invoker)
-- select count(*) from public.companies_alvara_summary;

reset role;

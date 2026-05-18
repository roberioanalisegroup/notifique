-- Auditoria P0: tabelas public sem RLS ou sem políticas.
-- Executar no SQL Editor do Supabase (como superuser / postgres).

-- 1) Tabelas sem RLS
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and rowsecurity = false
order by tablename;

-- 2) Tabelas com RLS mas sem nenhuma política
select t.tablename
from pg_tables t
where t.schemaname = 'public'
  and t.rowsecurity = true
  and not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = t.tablename
  )
order by t.tablename;

-- 3) Resumo de políticas por tabela
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;

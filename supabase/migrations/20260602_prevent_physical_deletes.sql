-- ==========================================
-- MIGRATION: 20260602_prevent_physical_deletes.sql
-- DESCRIÇÃO: Impede a exclusão física (DELETE) de empresas, vínculos e documentos para compliance de auditoria.
-- ==========================================

create or replace function public.prevent_physical_delete_in_production()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Exclusão física de registros é proibida por conformidade e integridade referencial. Utilize soft-delete (archived_at ou cancelled_at/cancelled_by).';
  return null;
end;
$$;

-- Vincular gatilhos nas tabelas principais para bloquear DELETE
drop trigger if exists trg_prevent_delete_companies on public.companies;
create trigger trg_prevent_delete_companies
  before delete on public.companies
  for each row execute function public.prevent_physical_delete_in_production();

drop trigger if exists trg_prevent_delete_company_alvaras on public.company_alvaras;
create trigger trg_prevent_delete_company_alvaras
  before delete on public.company_alvaras
  for each row execute function public.prevent_physical_delete_in_production();

drop trigger if exists trg_prevent_delete_company_alvara_documents on public.company_alvara_documents;
create trigger trg_prevent_delete_company_alvara_documents
  before delete on public.company_alvara_documents
  for each row execute function public.prevent_physical_delete_in_production();

comment on function public.prevent_physical_delete_in_production() is 'Impede exclusão física nas tabelas críticas de compliance (empresas, vínculos e documentos), exigindo soft-delete.';

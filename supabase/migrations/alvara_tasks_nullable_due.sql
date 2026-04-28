-- Vencimento (due_date) passa a ser preenchido após registo da data_emissao no vínculo.
-- Garantir antes que não existam duas linhas pendente sem due_date para o mesmo company_alvara_id.

alter table public.alvara_tasks
  drop constraint if exists alvara_tasks_company_alvara_id_due_date_key;

alter table public.alvara_tasks
  alter column due_date drop not null;

create unique index if not exists alvara_tasks_company_alvara_due_unique
  on public.alvara_tasks (company_alvara_id, due_date)
  where due_date is not null;

create unique index if not exists alvara_tasks_um_pendente_sem_vencimento_por_vinculo
  on public.alvara_tasks (company_alvara_id)
  where status = 'pendente' and due_date is null;

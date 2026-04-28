-- Uma linha concluída pode ter o mesmo due_date que a nova pendente (próximo ciclo).
drop index if exists public.alvara_tasks_company_alvara_due_unique;
drop index if exists public.idx_alvara_tasks_company_alvara_due_unique;

create unique index if not exists alvara_tasks_company_alvara_due_unique
  on public.alvara_tasks (company_alvara_id, due_date)
  where due_date is not null and status = 'pendente';

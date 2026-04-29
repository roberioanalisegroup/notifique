-- Novo tipo de evento: alteração do código interno da empresa no perfil.
do $$
declare
  cname text;
begin
  select con.conname
    into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'company_history'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%event_type%';
  if cname is not null then
    execute format('alter table public.company_history drop constraint %I', cname);
  end if;
end $$;

alter table public.company_history
  add constraint company_history_event_type_check
  check (
    event_type in (
      'cadastro_sync',
      'arquivamento',
      'restauracao',
      'tarefa_vinculada',
      'tarefa_desvinculada',
      'tarefa_atualizada',
      'codigo_empresa_atualizado'
    )
  );

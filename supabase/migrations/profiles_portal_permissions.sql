-- Permissões finas por área do portal (leitura vs edição) em profiles.portal_permissions JSONB.

alter table public.profiles add column if not exists portal_permissions jsonb null;

comment on column public.profiles.portal_permissions is
  'Mapa opcional {"screen_key": "read"|"edit"}. null = acesso total (compatibilidade). role=admin ignora sempre.';

-- Impede utilizador não-admin de mudar próprio cargo, permissões ou is_active pela API Postgres (Cliente).
create or replace function public.profiles_block_self_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if new.id is distinct from auth.uid() then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.portal_permissions is distinct from old.portal_permissions then
    raise exception 'Alteração não permitida: role, ativo ou permissões de telas apenas via administrador.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_block_privileges on public.profiles;
create trigger trg_profiles_block_privileges
  before update on public.profiles
  for each row execute function public.profiles_block_self_privilege_escalation();

-- Permite que utilizadores autenticados leiam perfis (id, display_name) de todos,
-- para a API do histórico da empresa resolver quem fez cada alteração.
drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

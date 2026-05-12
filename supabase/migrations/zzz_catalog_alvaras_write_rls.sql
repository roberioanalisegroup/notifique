-- Catálogo global (alvarás, grupos, etapas): após fix_security_tenancy só existia SELECT para
-- utilizadores autenticados; as rotas /api/alvaras*, /api/alvara-groups* usam o JWT do utilizador,
-- pelo que INSERT/UPDATE/DELETE falhavam em RLS. Restaurar escrita para role authenticated.

create policy "authenticated_insert_alvaras" on public.alvaras
  for insert
  with check (auth.role() = 'authenticated');

create policy "authenticated_update_alvaras" on public.alvaras
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated_delete_alvaras" on public.alvaras
  for delete
  using (auth.role() = 'authenticated');

create policy "authenticated_insert_alvara_groups" on public.alvara_groups
  for insert
  with check (auth.role() = 'authenticated');

create policy "authenticated_update_alvara_groups" on public.alvara_groups
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated_delete_alvara_groups" on public.alvara_groups
  for delete
  using (auth.role() = 'authenticated');

create policy "authenticated_insert_alvara_checklist_items" on public.alvara_checklist_items
  for insert
  with check (auth.role() = 'authenticated');

create policy "authenticated_update_alvara_checklist_items" on public.alvara_checklist_items
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated_delete_alvara_checklist_items" on public.alvara_checklist_items
  for delete
  using (auth.role() = 'authenticated');

-- Restringe sync_config e sync_logs a utilizadores com role admin (public.is_admin()).
-- Cron / rotas Next com JWT de admin continuam a funcionar; service_role ignora RLS.

drop policy if exists "auth_full" on public.sync_config;
drop policy if exists "auth_full" on public.sync_logs;

create policy "sync_config_admin_only" on public.sync_config
  for all using (public.is_admin()) with check (public.is_admin());

create policy "sync_logs_admin_only" on public.sync_logs
  for all using (public.is_admin()) with check (public.is_admin());

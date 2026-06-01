-- Templates reutilizáveis de checklist (etapas), criados pelo utilizador.

create table public.alvara_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  source_alvara_id uuid references public.alvaras(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alvara_checklist_templates_name_len check (char_length(name) between 1 and 200)
);

create index idx_alvara_checklist_templates_created_by
  on public.alvara_checklist_templates (created_by, updated_at desc);

create table public.alvara_checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.alvara_checklist_templates(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint alvara_checklist_template_items_label_len check (char_length(label) between 1 and 500)
);

create index idx_alvara_checklist_template_items_template
  on public.alvara_checklist_template_items (template_id, sort_order);

create trigger trg_alvara_checklist_templates_upd
  before update on public.alvara_checklist_templates
  for each row execute function public.set_updated_at();

alter table public.alvara_checklist_templates enable row level security;
alter table public.alvara_checklist_template_items enable row level security;

-- Templates: cada utilizador gere os seus; leitura só dos próprios.
create policy "alvara_checklist_templates_select"
  on public.alvara_checklist_templates for select to authenticated
  using (created_by = auth.uid());

create policy "alvara_checklist_templates_insert"
  on public.alvara_checklist_templates for insert to authenticated
  with check (
    public.portal_has_edit('alvaras_etapas')
    and created_by = auth.uid()
  );

create policy "alvara_checklist_templates_update"
  on public.alvara_checklist_templates for update to authenticated
  using (
    public.portal_has_edit('alvaras_etapas')
    and created_by = auth.uid()
  )
  with check (
    public.portal_has_edit('alvaras_etapas')
    and created_by = auth.uid()
  );

create policy "alvara_checklist_templates_delete"
  on public.alvara_checklist_templates for delete to authenticated
  using (
    public.portal_has_edit('alvaras_etapas')
    and created_by = auth.uid()
  );

-- Itens: acesso via template do utilizador.
create policy "alvara_checklist_template_items_select"
  on public.alvara_checklist_template_items for select to authenticated
  using (
    exists (
      select 1 from public.alvara_checklist_templates t
      where t.id = template_id and t.created_by = auth.uid()
    )
  );

create policy "alvara_checklist_template_items_insert"
  on public.alvara_checklist_template_items for insert to authenticated
  with check (
    public.portal_has_edit('alvaras_etapas')
    and exists (
      select 1 from public.alvara_checklist_templates t
      where t.id = template_id and t.created_by = auth.uid()
    )
  );

create policy "alvara_checklist_template_items_update"
  on public.alvara_checklist_template_items for update to authenticated
  using (
    public.portal_has_edit('alvaras_etapas')
    and exists (
      select 1 from public.alvara_checklist_templates t
      where t.id = template_id and t.created_by = auth.uid()
    )
  )
  with check (
    public.portal_has_edit('alvaras_etapas')
    and exists (
      select 1 from public.alvara_checklist_templates t
      where t.id = template_id and t.created_by = auth.uid()
    )
  );

create policy "alvara_checklist_template_items_delete"
  on public.alvara_checklist_template_items for delete to authenticated
  using (
    public.portal_has_edit('alvaras_etapas')
    and exists (
      select 1 from public.alvara_checklist_templates t
      where t.id = template_id and t.created_by = auth.uid()
    )
  );

grant select, insert, update, delete on public.alvara_checklist_templates to authenticated;
grant select, insert, update, delete on public.alvara_checklist_template_items to authenticated;

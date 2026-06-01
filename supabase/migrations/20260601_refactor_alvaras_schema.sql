-- ==========================================
-- MIGRATION: 20260601_refactor_alvaras_schema.sql
-- DESCRIÇÃO: Refatoração robusta do módulo de alvarás
-- ==========================================

-- ==========================================
-- PASSO 1: ALTERAÇÕES NA TABELA company_alvaras (EXISTENTE)
-- ==========================================
alter table public.company_alvaras add column if not exists is_required boolean not null default true;
alter table public.company_alvaras add column if not exists is_exempt boolean not null default false;
alter table public.company_alvaras add column if not exists exemption_reason text;
alter table public.company_alvaras add column if not exists monitoring_status text not null default 'ativo';
alter table public.company_alvaras add column if not exists archived_at timestamptz;
alter table public.company_alvaras add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.company_alvaras add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Adicionar constraint segura para status de monitoramento ativo/suspenso
alter table public.company_alvaras drop constraint if exists company_alvaras_monitoring_status_check;
alter table public.company_alvaras add constraint company_alvaras_monitoring_status_check 
  check (monitoring_status in ('ativo', 'dispensado', 'suspenso'));

-- Comentários de Auditoria e Legado
comment on column public.company_alvaras.monitoring_status is 'Estados operacionais do monitoramento do vínculo: ativo, dispensado, suspenso';
comment on column public.company_alvaras.archived_at is 'Soft-delete: carimbo de data se o vínculo foi arquivado de forma definitiva';

-- ==========================================
-- PASSO 2: CRIAÇÃO DA TABELA company_alvara_documents
-- ==========================================
create table if not exists public.company_alvara_documents (
  id                  uuid primary key default gen_random_uuid(),
  company_alvara_id   uuid not null references public.company_alvaras(id) on delete restrict,
  issue_date          date, -- Anulável para legado (Opção B); nova validação será obrigatória na RPC
  expiration_date     date,
  is_indefinite       boolean not null default false,
  file_path           text,
  file_name           text,
  file_size           bigint,
  file_mime_type      text,
  is_current          boolean not null default false,
  source_task_id      uuid, -- Será referenciado via FK no Passo 4 pós criação/alteração de alvara_tasks
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,
  replaced_at         timestamptz,
  replaced_by         uuid references auth.users(id) on delete set null,
  archived_at         timestamptz
);

-- Habilitar RLS e Permissões Básicas de Homologação
alter table public.company_alvara_documents enable row level security;
create policy "homologation_documents_policy" on public.company_alvara_documents 
  for all to authenticated using (true);
grant select, insert, update on public.company_alvara_documents to authenticated;

-- ==========================================
-- PASSO 3: ALTERAÇÕES NA TABELA alvara_tasks (EXISTENTE)
-- ==========================================
alter table public.alvara_tasks add column if not exists task_type text not null default 'renovacao';
alter table public.alvara_tasks add column if not exists priority text not null default 'media';
alter table public.alvara_tasks add column if not exists start_after date;
alter table public.alvara_tasks add column if not exists assigned_to uuid references public.profiles(id) on delete restrict;
alter table public.alvara_tasks add column if not exists opened_from_document_id uuid references public.company_alvara_documents(id) on delete restrict;
alter table public.alvara_tasks add column if not exists result_document_id uuid references public.company_alvara_documents(id) on delete restrict;
alter table public.alvara_tasks add column if not exists completed_by uuid references auth.users(id) on delete set null;
alter table public.alvara_tasks add column if not exists cancelled_at timestamptz;
alter table public.alvara_tasks add column if not exists cancelled_by uuid references auth.users(id) on delete set null;
alter table public.alvara_tasks add column if not exists cancellation_reason text;
alter table public.alvara_tasks add column if not exists impediment_reason text;
alter table public.alvara_tasks add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.alvara_tasks add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Atualizar constraint de status para desmembrar em_andamento e com_impedimento físicos no banco
alter table public.alvara_tasks drop constraint if exists alvara_tasks_status_check;
alter table public.alvara_tasks add constraint alvara_tasks_status_check 
  check (status in ('pendente', 'em_andamento', 'com_impedimento', 'concluida', 'cancelada'));

-- Constraint para tipos de tarefa operacional
alter table public.alvara_tasks drop constraint if exists alvara_tasks_task_type_check;
alter table public.alvara_tasks add constraint alvara_tasks_task_type_check 
  check (task_type in ('primeira_emissao', 'renovacao', 'regularizacao', 'revisao', 'cancelamento', 'dispensa'));

-- Constraint de prioridade
alter table public.alvara_tasks drop constraint if exists alvara_tasks_priority_check;
alter table public.alvara_tasks add constraint alvara_tasks_priority_check 
  check (priority in ('baixa', 'media', 'alta', 'critica'));

-- ==========================================
-- PASSO 4: RESOLVER DEPENDÊNCIA CRUZADA (FK em company_alvara_documents)
-- ==========================================
alter table public.company_alvara_documents drop constraint if exists fk_company_alvara_docs_source_task;
alter table public.company_alvara_documents 
  add constraint fk_company_alvara_docs_source_task
  foreign key (source_task_id) references public.alvara_tasks(id) on delete set null;

-- ==========================================
-- PASSO 5: CRIAÇÃO DA TABELA DE HISTÓRICO DOCUMENTAL (Opção A)
-- ==========================================
create table if not exists public.company_alvara_document_history (
  id                  uuid primary key default gen_random_uuid(),
  company_alvara_id   uuid not null references public.company_alvaras(id) on delete restrict,
  document_id         uuid not null references public.company_alvara_documents(id) on delete restrict,
  task_id             uuid references public.alvara_tasks(id) on delete set null,
  event_type          text not null,
  description         text,
  metadata            jsonb,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null
);

-- Constraint para os tipos de evento de auditoria documental permitidos
alter table public.company_alvara_document_history drop constraint if exists company_alvara_doc_history_event_type_check;
alter table public.company_alvara_document_history add constraint company_alvara_doc_history_event_type_check 
  check (event_type in ('document_created', 'document_replaced', 'document_file_updated', 'document_marked_current', 'document_archived', 'document_restored'));

-- RLS e Segurança
alter table public.company_alvara_document_history enable row level security;
create policy "homologation_document_history_policy" on public.company_alvara_document_history 
  for all to authenticated using (true);
grant select, insert on public.company_alvara_document_history to authenticated;

-- ==========================================
-- PASSO 6: CRIAÇÃO DA TABELA DE HISTÓRICO DE TAREFAS
-- ==========================================
create table if not exists public.alvara_task_history (
  id                  uuid primary key default gen_random_uuid(),
  task_id             uuid not null references public.alvara_tasks(id) on delete restrict,
  event_type          text not null,
  from_status         text,
  to_status           text,
  description         text,
  metadata            jsonb,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null
);

-- RLS e Segurança
alter table public.alvara_task_history enable row level security;
create policy "homologation_task_history_policy" on public.alvara_task_history 
  for all to authenticated using (true);
grant select, insert on public.alvara_task_history to authenticated;

-- ==========================================
-- PASSO 7: CRIAÇÃO DA TABELA DE ERROS DO CICLO DE VIDA (lifecycle_errors)
-- ==========================================
create table if not exists public.lifecycle_errors (
  id                  uuid primary key default gen_random_uuid(),
  company_alvara_id   uuid references public.company_alvaras(id) on delete restrict,
  task_id             uuid references public.alvara_tasks(id) on delete restrict,
  operation           text not null,
  error_message       text not null,
  payload             jsonb,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  resolved_by         uuid references auth.users(id) on delete set null,
  resolution_notes    text
);

-- RLS e Segurança
alter table public.lifecycle_errors enable row level security;
create policy "homologation_errors_policy" on public.lifecycle_errors 
  for all to authenticated using (true);
grant select, insert, update on public.lifecycle_errors to authenticated;

-- ==========================================
-- PASSO 8: CRIAÇÃO DE ÍNDICES DE ALTA PERFORMANCE E UNICIDADE
-- ==========================================
-- 8.1 Unicidade de Documento Vigente Atual (Impede concorrência de múltiplos vigentes no mesmo vínculo)
create unique index if not exists uniq_company_alvara_current_document
on public.company_alvara_documents(company_alvara_id)
where is_current = true;

-- 8.2 Unicidade de Tarefas Ativas de Renovação (Prepara o Kanban contra duplicidade do próximo ciclo)
create unique index if not exists uniq_open_renewal_task
on public.alvara_tasks(company_alvara_id, task_type, due_date)
where status in ('pendente', 'em_andamento', 'com_impedimento')
and task_type = 'renovacao';

-- 8.3 Índices operacionais e performáticos recomendados
create index if not exists idx_company_alvara_docs_link on public.company_alvara_documents(company_alvara_id);
create index if not exists idx_alvara_tasks_link_status on public.alvara_tasks(company_alvara_id, status);
create index if not exists idx_alvara_tasks_start_after on public.alvara_tasks(start_after);
create index if not exists idx_lifecycle_errors_resolved_at on public.lifecycle_errors(resolved_at);

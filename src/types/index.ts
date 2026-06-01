/** Tipo de identificação do cadastro (define se pode usar BrasilAPI CNPJ). */
export type CompanyCadastroTipo = "cnpj" | "mei" | "caepf" | "cpf" | "outros";

export interface Company {
  id: string;
  cadastro_tipo: CompanyCadastroTipo;
  /** Apenas dígitos; chave única. */
  numero_documento: string;
  /** 14 dígitos quando PJ/MEI/CAEPF; null se só CPF ou outros sem CNPJ. */
  cnpj: string | null;
  /** Código interno manual (referência interna, busca na listagem). */
  codigo_empresa?: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  data_situacao: string | null;
  natureza_juridica: string | null;
  atividade_principal: string | null;
  atividades_secundarias: unknown;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  capital_social: number | null;
  porte: string | null;
  opcao_simples: boolean | null;
  opcao_mei: boolean | null;
  data_abertura: string | null;
  raw_data: Record<string, unknown> | null;
  last_sync_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
  /** Preenchido quando a empresa foi arquivada (soft-delete). Null = lista principal. */
  archived_at?: string | null;
  /** Perfil (`profiles.id`) do colaborador responsável pela empresa no portal. */
  responsible_user_id?: string | null;
  /** Preenchido em joins PostgREST (tarefas / vínculos). */
  responsible?: { id: string; display_name: string | null } | null;
}

export type CompanyHistoryEventType =
  | "cadastro_sync"
  | "arquivamento"
  | "restauracao"
  | "tarefa_vinculada"
  | "tarefa_desvinculada"
  | "tarefa_atualizada"
  | "codigo_empresa_atualizado"
  | "company_alvara_observations_updated"
  // Fase 2: Administrative actions
  | "company_alvara_monitoring_suspended"
  | "company_alvara_monitoring_reactivated"
  | "company_alvara_archived"
  | "company_alvara_restored"
  | "company_alvara_document_archived"
  | "company_alvara_document_restored"
  | "company_alvara_task_force_completed";

/** Linha do histórico da empresa (aba Histórico no cadastro). */
export interface CompanyHistoryEvent {
  id: string;
  company_id: string;
  event_type: CompanyHistoryEventType;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_user_id: string | null;
  actor_display_name?: string | null;
}

/** Opções de filtro da listagem de empresas (UFs, cidades e situações existentes no cadastro). */
export interface CompanyFilterOptions {
  ufs: string[];
  citiesByUf: Record<string, string[]>;
  situacoes: string[];
}

export interface SyncConfig {
  id: string;
  sync_enabled: boolean;
  sync_time: string;
  date_start: string | null;
  date_end: string | null;
  only_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

/** Permissões finas ({ area: "read" | "edit" }); `null` no perfil = acesso total (legado). */
export type PortalPermissionsMap = Partial<Record<string, "read" | "edit">>;

export interface PortalUser {
  id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  /** `public.profiles.role` */
  role: "admin" | "user";
  /** `public.profiles.is_active` — sincronizado com banimento no Auth quando inativo. */
  is_active: boolean;
  /** Data de fim de banimento no Auth (informativo). */
  banned_until?: string | null;
  /** Mapa de telas apenas para role `user`. `null` = todas as áreas como edição (comportamento antigo). */
  portal_permissions: PortalPermissionsMap | null;
}

export interface SyncLog {
  id: string;
  started_at: string;
  finished_at: string | null;
  total: number;
  success: number;
  errors: number;
  skipped: number;
  triggered_by: string;
  notes: string | null;
}

export interface AlvaraGroup {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Valores de `alvaras.frequencia` — ver `src/lib/alvara-frequency.ts` */
export type AlvaraFrequenciaSlug =
  | "diaria"
  | "semanal"
  | "decendial"
  | "mensal"
  | "bimestral"
  | "trimestral"
  | "semestral"
  | "anual"
  | "personalizada";

/** Valores de `alvaras.weekend_adjust` */
export type AlvaraWeekendAdjust = "none" | "postpone" | "anticipate";

export interface Alvara {
  id: string;
  /** Null = sem grupo (pode atribuir depois) */
  group_id: string | null;
  name: string;
  description: string | null;
  orgao_emissor: string | null;
  frequencia: AlvaraFrequenciaSlug;
  weekend_adjust: AlvaraWeekendAdjust;
  /** Dia do mês (1–31) ou dia inicial (decendial) */
  legal_dia: number | null;
  /** Mês (1–12) para anual / ciclos */
  legal_mes: number | null;
  /** 0=domingo … 6=sábado — semanal */
  legal_dia_semana: number | null;
  /** Dias úteis após o dia inicial — decendial */
  legal_dias_uteis: number | null;
  /** No 1.º ciclo da tarefa: dias corridos após criação para mover de Pendente a Em andamento. */
  prazo_inicio_dias: number;
  /** Se verdadeiro, concluir a tarefa exige documento em `company_alvaras.arquivo_url`. */
  anexo_obrigatorio?: boolean;
  /** Template de etapas associado (opcional). */
  checklist_template_id?: string | null;
  /** Se verdadeiro, todas as etapas da checklist devem estar concluídas para concluir a tarefa. */
  checklist_obrigatorio?: boolean;
  is_active: boolean;
  dias_frequencia_personalizada?: number | null;
  created_at: string;
  updated_at: string;
}

/** Tarefas de acompanhamento por vínculo empresa–alvará (vencimento preenchido após emissão no vínculo). */
/** Etapa configurável por tipo de alvará (portal → Alvarás → Etapas). */
export interface AlvaraChecklistItem {
  id: string;
  alvara_id: string;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Template reutilizável de etapas (criado pelo utilizador em Alvarás → Etapas). */
export interface AlvaraChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  source_alvara_id: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
  items?: AlvaraChecklistTemplateItem[];
}

export interface AlvaraChecklistTemplateItem {
  id: string;
  template_id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

/** Linha da checklist num cartão / tarefa (template + estado). */
export interface AlvaraTaskChecklistRow {
  item_id: string;
  label: string;
  sort_order: number;
  completed: boolean;
  comment: string | null;
  attachment_url: string | null;
  completed_at: string | null;
}

export interface AlvaraTask {
  id: string;
  company_alvara_id: string;
  /** Preenchido após registo da data de emissão no vínculo (regra de frequência). */
  due_date: string | null;
  /** Só 1.º ciclo: último dia para passar o card a Em andamento (Pendente). Ciclos seguintes: null. */
  inicio_obrigatorio_ate: string | null;
  status: "pendente" | "em_andamento" | "com_impedimento" | "concluida" | "cancelada";
  title: string | null;
  completed_at: string | null;
  notes: string | null;
  protocolo?: string | null;
  created_at: string;
  updated_at: string;
  start_after?: string | null;
  task_type?: string;
  priority?: string;
  assigned_to?: string | null;
  opened_from_document_id?: string | null;
  result_document_id?: string | null;
  completed_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  impediment_reason?: string | null;
}

export interface CompanyAlvara {
  id: string;
  company_id: string;
  alvara_id: string;
  numero: string | null;
  data_emissao: string | null;
  /** Até haver emissão: prazo de início (criação da tarefa + dias do tipo). Após emissão: validade legal do certificado. */
  data_vencimento: string | null;
  data_notificacao: string | null;
  status: string;
  observacoes: string | null;
  arquivo_url: string | null;
  frequencia_override?: string | null;
  dias_frequencia_personalizada?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyAlvaraSummary {
  id: string;
  archived_at?: string | null;
  cadastro_tipo: CompanyCadastroTipo;
  codigo_empresa?: string | null;
  numero_documento: string;
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  municipio: string | null;
  uf: string | null;
  /** Colaborador responsável pela empresa (`profiles.id`). */
  responsible_user_id?: string | null;
  /** CNAE principal (texto Receita) — coluna da view após migração `companies_alvara_summary_cnae_busca`. */
  atividade_principal?: string | null;
  /** Lista JSON de `{ codigo, descricao }` — coluna da view após a mesma migração. */
  atividades_secundarias?: unknown;
  /** Dígitos dos CNAEs concatenados (uso interno / filtros). */
  cnaes_busca?: string | null;
  last_sync_at: string | null;
  sync_status: string | null;
  updated_at: string;
  total_alvaras: number;
  alvaras_emitidos: number;
  alvaras_pendentes: number;
  alvaras_vencidos: number;
  alvaras_notificados: number;
}

/** Histórico de alterações na tarefa (portal) */
export interface AlvaraTaskHistory {
  id: string;
  task_id: string;
  event_type: "created" | "status" | "notes" | "attachment" | "due_date" | "system" | "checklist";
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CompanyFormData {
  cnpj: string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  situacao_cadastral?: string | null;
}

export interface AlvaraGroupFormData {
  name: string;
  description?: string | null;
  color?: string;
  icon?: string;
  is_active?: boolean;
}

export interface AlvaraFormData {
  group_id?: string | null;
  name: string;
  description?: string | null;
  orgao_emissor?: string | null;
  frequencia?: AlvaraFrequenciaSlug;
  weekend_adjust?: AlvaraWeekendAdjust;
  is_active?: boolean;
}

export interface CompanyAlvaraFormData {
  company_id: string;
  alvara_id: string;
  numero?: string | null;
  data_emissao?: string | null;
  data_vencimento?: string | null;
  data_notificacao?: string | null;
  status?: string;
  observacoes?: string | null;
  arquivo_url?: string | null;
}

/** Resposta /api/cnpj/v1 — BrasilAPI (formato passou a incluir cnae_fiscal, descricao_situacao_cadastral, cnaes_secundarios) */
export interface BrasilAPICNPJ {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  /** Legado: texto; resposta recente: número (usar `descricao_situacao_cadastral` quando existir) */
  situacao_cadastral?: string | number;
  descricao_situacao_cadastral?: string;
  data_situacao_cadastral?: string | null;
  natureza_juridica?: string;
  atividade_principal?: { codigo: string; descricao: string } | { codigo: string; descricao: string }[];
  cnae_fiscal?: number;
  cnae_fiscal_descricao?: string;
  atividades_secundarias?: Array<{ codigo: string; descricao: string }>;
  cnaes_secundarios?: Array<{ codigo: number; descricao: string } | { codigo: string; descricao: string }>;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  ddd_telefone_1?: string;
  email?: string | null;
  capital_social?: number;
  porte?: string;
  opcao_pelo_simples?: boolean | null;
  opcao_pelo_mei?: boolean | null;
  data_inicio_atividade?: string;
}

export interface CompanyWithAlvaras {
  company: Company;
  company_alvaras: Array<
    CompanyAlvara & {
      alvaras: Alvara & { alvara_groups: AlvaraGroup };
    }
  >;
}

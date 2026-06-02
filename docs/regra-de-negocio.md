# 🛡️ Regras de Negócio — Portal de Gestão e Monitoramento de Alvarás (Notifique)

> **Versão:** 2.1 — Atualizada em 2026-06-02  
> **Fonte:** Análise completa e rigorosa do código-fonte (`src/`, `supabase/`, `middleware.ts`)  
> **Frase-Guia da Arquitetura:**  
> *“O vínculo organiza. O documento comprova. A tarefa operacionaliza. O histórico audita.”*
>
> Este documento é a **fonte única de verdade** definitiva para o funcionamento lógico e técnico do sistema.

---

## 📑 Índice

1. [Arquitetura Geral do Sistema](#1-arquitetura-geral-do-sistema)
   - 1.1 [Glossário Oficial](#11-glossário-oficial)
2. [Modelo de Dados e Banco de Dados](#2-modelo-de-dados-e-banco-de-dados)
   - 2.1 [Entidades Principais](#21-entidades-principais)
   - 2.2 [Relações e Integridade](#22-relações-e-integridade)
   - 2.3 [Fonte da Verdade por Dado](#23-fonte-da-verdade-por-dado)
   - 2.4 [Estados Terminais](#24-estados-terminais)
   - 2.5 [O que nunca deve acontecer (Invariantes Rígidas)](#25-o-que-nunca-deve-acontecer-invariantes-rígidas)
3. [Autenticação, Autorização e Controle de Acesso](#3-autenticação-autorização-e-controle-de-acesso)
4. [Módulo de Empresas](#4-módulo-de-empresas)
5. [Módulo de Alvarás (Cadastro de Tipos)](#5-módulo-de-alvarás-cadastro-de-tipos)
6. [Módulo de Acompanhamento (Kanban)](#6-módulo-de-acompanhamento-kanban)
7. [Módulo de Dashboard](#7-módulo-de-dashboard)
8. [Ciclo de Vida de uma Tarefa](#8-ciclo-de-vida-de-uma-tarefa)
9. [Status Dinâmicos de Alvarás e Tarefas](#9-status-dinâmicos-de-alvarás-e-tarefas)
10. [Cálculo de Frequências e Datas de Vencimento](#10-cálculo-de-frequências-e-datas-de-vencimento)
11. [Sistema de Documentos (company_alvara_documents)](#11-sistema-de-documentos-company_alvara_documents)
12. [Checklist por Tipo de Alvará](#12-checklist-por-tipo-de-alvará)
13. [Upload de Arquivos e Evidências](#13-upload-de-arquivos-e-evidências)
14. [Histórico e Auditoria](#14-histórico-e-auditoria)
15. [Sincronização com Receita Federal (BrasilAPI)](#15-sincronização-com-receita-federal-brasilapi)
16. [Ciclo de Renovação Automática](#16-ciclo-de-renovação-automática)
17. [Gatilhos Automáticos do Banco de Dados](#17-gatilhos-automáticos-do-banco-de-dados)
18. [Segurança e Controle de Acesso à API](#18-segurança-e-controle-de-acesso-à-api)
19. [Simulação do Fluxo Operacional Completo](#19-simulação-do-fluxo-operacional-completo)
20. [Dependências entre Módulos](#20-dependências-entre-módulos)

---

## 1. Arquitetura Geral do Sistema

### Stack Tecnológico
- **Frontend/Backend:** Next.js 15 (App Router, Server Components + API Routes)
- **Banco de Dados:** Supabase (PostgreSQL com RLS habilitado)
- **Autenticação:** Supabase Auth (sessões JWT geridas pelo middleware)
- **Armazenamento de Arquivos:** Cloudflare R2 (via presign URL + fallback multipart)
- **Linguagem:** TypeScript

### Estrutura de Diretórios Principais
```
src/
  app/
    api/           → Rotas de API (Next.js Route Handlers)
    portal/        → Páginas protegidas do portal
    auth/          → Login e fluxo de autenticação
  lib/             → Lógica de negócio pura, utilitários, serviços
  components/      → Componentes React
  types/           → Tipagens TypeScript globais (index.ts)
supabase/
  schema.sql       → DDL base do banco de dados
  migrations/      → Migrações incrementais
```

### 1.1 Glossário Oficial

* **Vínculo (`company_alvaras`):**
  A obrigação monitorada da empresa em relação a um tipo de alvará do catálogo. Representa o elo organizacional persistente.
* **Documento (`company_alvara_documents`):**
  O alvará emitido oficialmente que comprova a conformidade, contendo obrigatoriamente data de emissão, vencimento e o arquivo físico de comprovação.
* **Tarefa (`alvara_tasks`):**
  O ciclo operacional ou card do Kanban que representa o esforço para obter, renovar, regularizar, cancelar ou dispensar um alvará específico.
* **Dossiê:**
  A visão consolidada lateral (Drawer/Slide-over) de um vínculo de alvará, reunindo em abas todos os seus documentos históricos, tarefas anteriores, linha do tempo operacional e opções de parametrização.
* **Anexo Oficial:**
  O arquivo físico comprobatório do alvará emitido carregado ao concluir a tarefa operacional. Ele é guardado no registro do documento vigente (`company_alvara_documents.file_path`).
* **Evidência:**
  Arquivo de apoio operacional (taxa paga, print, protocolo ou foto de exigência do órgão público) carregado durante o andamento da tarefa. Ele é anexado de forma puramente informativa no histórico da tarefa, nunca substituindo o documento oficial e nunca virando um registro vigente.

---

## 2. Modelo de Dados e Banco de Dados

### 2.1 Entidades Principais

#### Tabela `companies` — Empresas
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `cadastro_tipo` | text | Tipo de documento: `cnpj`, `mei`, `caepf`, `cpf`, `outros` |
| `numero_documento` | text | Apenas dígitos; chave única no sistema |
| `cnpj` | text | 14 dígitos quando PJ/MEI/CAEPF; `null` para CPF/outros |
| `codigo_empresa` | text | Código interno manual (máx. 80 chars) |
| `razao_social` | text | Razão Social (Receita Federal) |
| `nome_fantasia` | text | Nome Fantasia |
| `situacao_cadastral` | text | Situação RFB (ex: `ATIVA`, `INAPTA`) |
| `data_situacao` | date | Data de mudança de situação |
| `natureza_juridica` | text | Natureza jurídica (RFB) |
| `atividade_principal` | text | CNAE principal (texto + código) |
| `atividades_secundarias` | jsonb | Lista `[{codigo, descricao}]` de CNAEs secundários |
| `logradouro`, `numero`, `complemento`, `bairro`, `municipio`, `uf`, `cep` | text | Endereço completo |
| `telefone`, `email` | text | Contatos |
| `capital_social` | numeric | Capital social em R$ |
| `porte` | text | Porte (ME, EPP, etc.) |
| `opcao_simples`, `opcao_mei` | boolean | Opções tributárias |
| `data_abertura` | date | Data de abertura na RFB |
| `raw_data` | jsonb | Payload bruto da BrasilAPI (para reprocessamento) |
| `last_sync_at` | timestamptz | Última sincronização com a Receita |
| `sync_status` | text | `pending`, `ok`, `error`, `not_found`, `manual` |
| `sync_error` | text | Mensagem de erro da última sincronização |
| `archived_at` | timestamptz | Soft-delete: preenchido = arquivada |
| `responsible_user_id` | UUID | Perfil do colaborador responsável |
| `created_at`, `updated_at` | timestamptz | Controle temporal |

> **Constraint:** `UNIQUE (numero_documento)` — impede duplicidade de identificadores.

---

#### Tabela `alvaras` — Tipos de Alvará (Catálogo)
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `group_id` | UUID | FK para `alvara_groups` (nullable) |
| `name` | text | Nome do tipo de alvará |
| `description` | text | Descrição detalhada |
| `orgao_emissor` | text | Órgão responsável pela emissão |
| `frequencia` | text | Periodicidade de renovação (ver §10) |
| `weekend_adjust` | text | Ajuste de fim de semana: `none`, `postpone`, `anticipate` |
| `legal_dia` | smallint | Dia do mês (1–31) para ciclos fixos |
| `legal_mes` | smallint | Mês (1–12) para ciclos anuais fixos |
| `legal_dia_semana` | smallint | Dia da semana (0=Dom … 6=Sáb) para ciclos semanais |
| `legal_dias_uteis` | smallint | Dias úteis adicionais (0–60) para ciclos decendiais |
| `prazo_inicio_dias` | smallint | Dias de antecedência para início da renovação (1–3650; padrão: 30) |
| `anexo_obrigatorio` | boolean | Exige upload de arquivo para concluir a tarefa |
| `checklist_template_id` | UUID | FK → `alvara_checklist_templates` (SET NULL) de template padrão associado |
| `checklist_obrigatorio` | boolean | Exige conclusão de todas as etapas da checklist |
| `is_active` | boolean | Tipo ativo/inativo no catálogo |

---

#### Tabela `company_alvaras` — Vínculo Empresa ↔ Tipo de Alvará
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `company_id` | UUID | FK → `companies` (CASCADE DELETE) |
| `alvara_id` | UUID | FK → `alvaras` (RESTRICT DELETE) |
| `numero` | text | Número do alvará (dado do documento físico) |
| `data_emissao` | date | **[LEGADO]** Data de emissão (não utilizar; a fonte oficial é `company_alvara_documents.issue_date`) |
| `data_vencimento` | date | **[LEGADO]** Vencimento do documento (não utilizar; a fonte oficial é `company_alvara_documents.expiration_date`) |
| `status` | text | **[LEGADO]** Status do vínculo (não utilizar; o status documental correto é calculado via `computeDocumentStatus()`) |
| `monitoring_status` | text | Estado de monitoramento ativo do vínculo: `ativo`, `dispensado`, `suspenso` |
| `is_required` | boolean | Indica se a obrigação é aplicável à empresa |
| `is_exempt` | boolean | Indica se a empresa tem dispensa regulamentar para este tipo |
| `exemption_reason` | text | Justificativa da isenção/dispensa |
| `archived_at` | timestamptz | Carimbo de arquivamento de vínculo (soft-delete) |
| `frequencia_override` | text | Override local de periodicidade para este vínculo |
| `observacoes` | text | Anotações operacionais persistentes do vínculo |
| `arquivo_url` | text | **[LEGADO]** Caminho antigo/legado do arquivo (não utilizar; a fonte oficial é `company_alvara_documents.file_path`) |

> **Constraint:** `UNIQUE (company_id, alvara_id)` — impede vincular o mesmo tipo de alvará duas vezes à mesma empresa.

---

#### Tabela `alvara_tasks` — Tarefas de Monitoramento
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `company_alvara_id` | UUID | FK → `company_alvaras` (CASCADE DELETE) |
| `due_date` | date | Data de vencimento/prazo da tarefa |
| `status` | text | `pendente`, `em_andamento`, `com_impedimento`, `concluida`, `cancelada` |
| `task_type` | text | `primeira_emissao`, `renovacao`, `regularizacao`, `revisao`, `cancelamento`, `dispensa` |
| `priority` | text | `baixa`, `media`, `alta`, `critica` |
| `title` | text | Título livre da tarefa |
| `notes` | text | Descrição/comentário (obrigatório para concluir) |
| `protocolo` | text | Número de protocolo (opcional) |
| `inicio_obrigatorio_ate` | date | Prazo limite para início (1.º ciclo) |
| `start_after` | date | Data a partir de quando a tarefa deve ser trabalhada |
| `completed_at` | timestamptz | Carimbo de conclusão |
| `completed_by` | UUID | Usuário que concluiu |
| `cancelled_at` | timestamptz | Carimbo de cancelamento |
| `cancelled_by` | UUID | Usuário que cancelou |
| `cancellation_reason` | text | Motivo do cancelamento |
| `impediment_reason` | text | Motivo do impedimento |
| `result_document_id` | UUID | Documento gerado ao concluir a tarefa |
| `opened_from_document_id` | UUID | Documento que originou a tarefa |
| `assigned_to` | UUID | Colaborador designado |

**Índices de Unicidade Críticos:**
- `UNIQUE (company_alvara_id, due_date) WHERE due_date IS NOT NULL AND status = 'pendente'` — impede duas tarefas pendentes com o mesmo vencimento.
- `UNIQUE (company_alvara_id) WHERE status = 'pendente' AND due_date IS NULL` — impede múltiplas tarefas pendentes sem data por vínculo.
- `UNIQUE (company_alvara_id, task_type, due_date) WHERE status IN ('pendente','em_andamento','com_impedimento') AND task_type = 'renovacao'` — impede duplicidade de tarefas de renovação abertas.

---

#### Tabela `company_alvara_documents` — Documentos Vigentes
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `company_alvara_id` | UUID | FK → `company_alvaras` |
| `issue_date` | date | Data de emissão do documento |
| `expiration_date` | date | Data de vencimento |
| `is_indefinite` | boolean | Validade permanente (sem data de expiração) |
| `file_path` | text | Caminho do arquivo no R2 |
| `file_name` | text | Nome original do arquivo |
| `file_size` | bigint | Tamanho em bytes |
| `file_mime_type` | text | Tipo MIME do arquivo |
| `is_current` | boolean | Documento vigente/atual do vínculo |
| `source_task_id` | UUID | Tarefa que gerou este documento |
| `notes` | text | Notas/observações do documento |
| `created_by` | UUID | Usuário que criou |
| `replaced_at` | timestamptz | Quando foi substituído |
| `replaced_by` | UUID | Usuário que substituiu |
| `archived_at` | timestamptz | Soft-delete do documento |

> **Índice Único Crítico:** `UNIQUE (company_alvara_id) WHERE is_current = true` — garante que há no máximo **um documento vigente** por vínculo a qualquer momento.

---

#### Tabela `alvara_task_history` — Histórico de Tarefas
Registra todos os eventos de uma tarefa ao longo de seu ciclo de vida.

| `event_type` | Quando é gerado |
|---|---|
| `created` | Inserção automática via trigger `trg_alvara_task_created_hist` |
| `status` | Mudança de status via PATCH |
| `notes` | Atualização de comentário/descrição |
| `attachment` | Upload de arquivo ao vínculo |
| `due_date` | Alteração da data de vencimento |
| `system` | Operações automáticas (conclusão, renovação) |
| `checklist` | Marcação/desmarcação de etapa da checklist |

---

#### Tabela `company_alvara_document_history` — Histórico Documental
Registra operações nos documentos. Tipos de evento:
- `document_created` — Novo documento inserido
- `document_replaced` — Documento substituído
- `document_file_updated` — Arquivo do documento atualizado
- `document_marked_current` — Documento definido como vigente
- `document_archived` — Documento arquivado
- `document_restored` — Documento restaurado

---

#### Tabela `company_history` — Histórico da Empresa
Registra eventos de nível da empresa:

| `event_type` | Descrição |
|---|---|
| `cadastro_sync` | Sincronização com a Receita Federal |
| `arquivamento` | Empresa arquivada |
| `restauracao` | Empresa restaurada |
| `tarefa_vinculada` | Novo vínculo empresa-alvará criado |
| `tarefa_desvinculada` | Vínculo removido |
| `tarefa_atualizada` | Vínculo atualizado |
| `codigo_empresa_atualizado` | Código interno alterado |
| `company_alvara_monitoring_suspended` | Monitoramento de um alvará suspenso |
| `company_alvara_monitoring_reactivated` | Monitoramento reativado |
| `company_alvara_archived` | Vínculo de alvará arquivado |
| `company_alvara_restored` | Vínculo de alvará restaurado |
| `company_alvara_document_archived` | Documento arquivado |
| `company_alvara_document_restored` | Documento restaurado |
| `company_alvara_task_force_completed` | Conclusão forçada pelo admin |

---

#### Tabela `lifecycle_errors` — Erros de Ciclo de Vida
Registra falhas graves durante transições de ciclo (transação `complete_alvara_task`). Visível apenas para `service_role`. Campos:
- `company_alvara_id`, `task_id` — Contexto do erro
- `operation` — Operação que falhou (ex: `concluir_tarefa`)
- `error_message` — Mensagem de erro
- `payload` — Payload completo para diagnóstico
- `resolved_at`, `resolved_by`, `resolution_notes` — Gestão de resolução pelo admin

---

#### Tabela `audit_logs` — Logs de Auditoria de Segurança
Eventos de segurança e operações sensíveis:

| `event_type` | Descrição |
|---|---|
| `sync_all_triggered` | Sincronização em massa iniciada |
| `users_created` / `users_updated` | Operações de usuário |
| `security_blocked_origin` | Requisição bloqueada por Origin inválido |
| `csv_import_rejected` | Importação CSV rejeitada |
| `authn_login_fail` / `authn_login_success` | Tentativas de login |
| `authz_fail` | Falha de autorização |
| `csp_violation` | Violação de Content Security Policy |
| `db.*` | Eventos genéricos de banco de dados |

> **Privacidade:** Dados PII (email, passwords, tokens) são **mascarados** antes da gravação. Os logs também são emitidos em stdout em formato JSON (compatível com SIEM).

---

#### View `companies_alvara_summary` — [LEGADO - NÃO UTILIZAR EM PRODUÇÃO / DEPRECADO]

> [!WARNING]
> **View de Dados Deprecada [LEGADO]:** Esta view materializada utiliza colunas legadas e obsoletas do banco (`company_alvaras.status` = `'emitido'`, `'pendente'`, `'vencido'`).
> Ela **não** deve ser utilizada como fonte oficial de dados para o Dashboard, Kanban, Dossiê ou qualquer contagem operacional no sistema de produção.
> A fonte de verdade absoluta para regularidade baseia-se exclusivamente em `company_alvara_documents` e no status documental computado (`computeDocumentStatus()`).

```sql
SELECT
  c.*,
  COUNT(ca.id)                                       AS total_alvaras,
  COUNT(ca.id) FILTER (WHERE ca.status = 'emitido')  AS alvaras_emitidos,   -- [LEGADO] ca.status
  COUNT(ca.id) FILTER (WHERE ca.status = 'pendente') AS alvaras_pendentes,  -- [LEGADO] ca.status
  COUNT(ca.id) FILTER (WHERE ca.status = 'vencido')  AS alvaras_vencidos,   -- [LEGADO] ca.status
  COUNT(ca.id) FILTER (WHERE ca.data_notificacao IS NOT NULL) AS alvaras_notificados,
  trim(concat_ws(' ', cnae_principal_digitos, cnaes_secundarios_digitos)) AS cnaes_busca
FROM companies c LEFT JOIN company_alvaras ca ON ca.company_id = c.id
GROUP BY c.id
```

A coluna `cnaes_busca` extrai apenas os dígitos de todos os CNAEs para permitir filtro rápido por código.

---

#### Tabela `alvara_checklist_templates` — Modelos de Checklist (Reutilizáveis)
Armazena os templates de etapas criados pelos utilizadores para serem associados de forma recorrente a tipos de alvarás.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `name` | text | Nome descritivo do template (1 a 200 caracteres) |
| `description` | text | Descrição detalhada ou anotações livres (nullable) |
| `created_by` | UUID | FK → `profiles` (CASCADE DELETE) do usuário criador |
| `source_alvara_id` | UUID | FK → `alvaras` (SET NULL DELETE) tipo de alvará de origem |
| `created_at` | timestamptz | Data de criação |
| `updated_at` | timestamptz | Última atualização |

> **Índice e Regras:**
> - `idx_alvara_checklist_templates_created_by` em `(created_by, updated_at DESC)` para listagem e ordenação cronológica rápida das configurações.
> - **RLS:** Acesso de leitura estritamente restrito ao criador do template (`created_by = auth.uid()`). A inserção, atualização e exclusão exigem nível `'edit'` na permissão de tela `'alvaras_etapas'`.

---

#### Tabela `alvara_checklist_template_items` — Itens do Modelo de Checklist
Contém as etapas lógicas pré-configuradas pertencentes a cada template de checklist.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `template_id` | UUID | FK → `alvara_checklist_templates` (CASCADE DELETE) |
| `label` | text | Descrição textual da etapa (1 a 500 caracteres) |
| `sort_order` | int | Ordem de ordenação visual (padrão: 0) |
| `created_at` | timestamptz | Data de criação |

> **Índice e Regras:**
> - `idx_alvara_checklist_template_items_template` em `(template_id, sort_order)`.
> - **RLS:** Leitura e modificação permitidas somente se o template pertencer ao usuário logado (`created_by = auth.uid()`) e as mutations exigem nível de permissão `'edit'` na tela `'alvaras_etapas'`.

---

#### Tabela `alvara_checklist_items` — Catálogo de Etapas de Checklist do Tipo de Alvará
Mantém as etapas ativas padrão associadas diretamente a cada tipo de alvará no catálogo global do sistema.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `alvara_id` | UUID | FK → `alvaras` (CASCADE DELETE) |
| `label` | text | Descrição da etapa lúdica |
| `sort_order` | int | Ordem de posicionamento padrão (padrão: 0) |
| `created_at` | timestamptz | Data de criação |
| `updated_at` | timestamptz | Última atualização |

> **Índice e Regras:**
> - `idx_alvara_checklist_items_alvara` em `(alvara_id, sort_order)`.
> - **RLS:** Leitura aberta para qualquer usuário autenticado (`authenticated`). Inserção, atualização e exclusão restritas às permissões administrativas do portal.

---

#### Tabela `alvara_task_checklist_progress` — Progresso da Checklist de uma Tarefa Ativa
Registra o estado de conclusão em tempo de execução de cada etapa da checklist vinculada a uma tarefa ativa.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `task_id` | UUID | FK → `alvara_tasks` (CASCADE DELETE) |
| `item_id` | UUID | FK → `alvara_checklist_items` (CASCADE DELETE) |
| `completed` | boolean | Indica se a etapa foi concluída pelo operador (padrão: false) |
| `updated_at` | timestamptz | Data da última alteração de estado |

> **Constraint e Índices:**
> - `UNIQUE (task_id, item_id)` — impede registros duplicados de progresso de um mesmo item por tarefa.
> - `idx_alvara_task_checklist_task` em `(task_id)` para carga rápida das etapas no Kanban e no modal de edição.

---

### 2.3 Fonte da Verdade por Dado
Define com clareza quais tabelas e colunas são os repositórios únicos e soberanos de cada informação ou métrica na aplicação.

| Dado | Campo Soberano no Banco (Fonte Oficial) | Função de Computação / Regra Lógica |
|---|---|---|
| **Data de emissão** | `company_alvara_documents.issue_date` | Lida a partir do documento vigente (`is_current = true`). |
| **Data de vencimento** | `company_alvara_documents.expiration_date` | Lida a partir do documento vigente (`is_current = true`). |
| **Arquivo oficial** | `company_alvara_documents.file_path` | Armazenado no Cloudflare R2 e referenciado no documento vigente. |
| **Documento atual** | `company_alvara_documents.is_current = true` | Um único registro ativo por vínculo. |
| **Status documental** | Computado dinamicamente | `computeDocumentStatus(current_document)` em `src/lib/alvara-status.ts`. |
| **Status operacional** | `alvara_tasks.status` | Gerido no Kanban e modal (`pendente`, `em_andamento`, etc.). |
| **Card do Kanban** | Entidade `alvara_tasks` | Cada card operacionaliza um ciclo de renovação ou primeira emissão. |
| **Evidências operacionais** | `alvara_task_history.metadata.evidence_attachments` | Lista de anexos informativos gravados nos logs de histórico da tarefa. |
| **Responsável da empresa** | `companies.responsible_user_id` | Colaborador da conta cliente, associado a `profiles.id`. |
| **Responsável da tarefa** | `alvara_tasks.assigned_to` | Colaborador designado para resolver a tarefa operacional. |
| **Observações do vínculo** | `company_alvaras.observacoes` | Campo de notas duradouras daquele tipo de alvará para a empresa. |
| **Histórico operacional** | Entidade `alvara_task_history` | Auditável através de logs imutáveis do ciclo da tarefa. |
| **Histórico documental** | Entidade `company_alvara_document_history` | Registros automáticos de criação, substituição e arquivamento de arquivos. |

> [!WARNING]
> **Campos Legados [LEGADO]:** Os campos `company_alvaras.status`, `company_alvaras.data_emissao`, `company_alvaras.data_vencimento` e `company_alvaras.arquivo_url` são estritamente **LEGADOS**. Eles **não** devem ser usados sob nenhuma hipótese como fonte de informação oficial para o Dashboard, Kanban, Dossiê ou cálculos de regularidade documental.

---

### 2.4 Estados Terminais
Define os estados a partir dos quais uma entidade ou fluxo torna-se imutável e encerra sua participação ativa na operação do portal.

#### Tarefa Concluída (`alvara_tasks.status = 'concluida'`)
* **Imutabilidade:** O registro torna-se totalmente fechado. Nenhuma alteração operacional convencional é permitida.
* **Kanban:** Cards concluídos são fixados na coluna correspondente e **nunca** podem ser reabertos por arrasto (drag-and-drop) — **[REGRA CORRIGIDA]**.
* **Documentação:** Está permanentemente atrelada ao registro do novo documento oficial gerado na transação.
* **Exceção (Reabertura Administrativa Excepcional - [EXCEÇÃO ADMINISTRATIVA]):**
  Um fluxo estritamente excepcional, restrito a administradores (`role = 'admin'`), que **exige justificativa textual detalhada obrigatória**, com o registro de auditoria permanente no histórico do sistema.
  - **Preservação de Ativos:** O documento original emitido e todo o histórico de logs da tarefa original são **integralmente preservados** para fins de integridade referencial.
  - **Diretriz Operacional:** A reabertura administrativa é uma medida de contingência emergencial. Ela deve ser estritamente evitada no dia a dia, sendo **preferencialmente substituída pela criação de uma nova tarefa corretiva** independente para tratar as correções operacionais necessárias.

#### Tarefa Cancelada (`alvara_tasks.status = 'cancelada'`)
* **Imutabilidade:** Estado operacional terminal irreversível — **[REGRA CORRIGIDA]**.
* **Efeitos:** O card é removido ou fixado na coluna de canceladas, **não** gera nenhum documento e **não** dispara a tarefa de renovação automática para o ciclo seguinte.
* **Exceção (Reabertura Administrativa Excepcional - [EXCEÇÃO ADMINISTRATIVA]):**
  Assim como a tarefa concluída, qualquer reversão do cancelamento de uma tarefa exige o mesmo protocolo estrito de reabertura administrativa por perfil `admin` com justificativa obrigatória e preservação intocada de todo o histórico, priorizando-se a abertura de uma **nova tarefa corretiva**.

#### Documento Arquivado (`company_alvara_documents.archived_at != null`)
* **Regularidade:** O documento perde o estado de vigência (`is_current = false`) e deixa de ser computado como comprovante de conformidade da empresa.

#### Vínculo Arquivado (`company_alvaras.archived_at != null`)
* **Operação:** O vínculo é ocultado da operação diária. Fica terminantemente **bloqueada** a movimentação ou conclusão de qualquer tarefa pendente associada a este vínculo (validação imposta na RPC do banco).

#### Empresa Arquivada (`companies.archived_at != null`)
* **Visibilidade:** O cliente e todas as suas obrigações correspondentes são ocultadas da listagem principal do portal, deixando de contar nos cálculos do Dashboard geral.

---

### 2.5 O que nunca deve acontecer (Invariantes Rígidas)
As regras que compõem o núcleo de segurança lógica e integridade operacional do sistema:

1. **Vigência Única:** Nunca deve haver mais de um documento vigente (`is_current = true`) para um mesmo vínculo (`company_alvara_id`) em qualquer momento.
2. **Sem Duplicidade de Renovação:** Nunca deve haver duas tarefas abertas (`pendente`, `em_andamento` ou `com_impedimento`) de renovação para o mesmo vínculo e mesma data de vencimento (`due_date`).
3. **Coerência de Encerramento:** Nunca deve existir uma tarefa marcada como concluída (`concluida`) sem um documento correspondente gerado em `company_alvara_documents`, exceto no caso de Encerramento Administrativo, o qual deve ser expressamente catalogado no histórico operacional.
4. **Proteção Física de Emissões:** Nunca deve haver caminhos de arquivos de documentos oficiais salvos na tabela `company_alvaras`. Documentos oficiais pertencem exclusivamente a `company_alvara_documents`.
5. **Segregação de Evidências:** Nunca uma evidência de andamento (comprovante temporário) deve ser registrada ou tratada como documento oficial de alvará.
6. **Bloqueio de Inativos:** Nunca uma tarefa vinculada a um alvará suspenso ou arquivado deve ser concluída ou ter seu status operacional alterado.
7. **Respeito ao Calendário:** Nunca uma tarefa futura deve ser exibida no quadro de Kanban diário padrão antes da sua data de início obrigatória definida em `start_after`.
8. **Imutabilidade de Encerrados:** Nunca uma tarefa em status terminal (`concluida` ou `cancelada`) deve ser reaberta ou alterada através de drag-and-drop no Kanban.
9. **Filtro de Descarte:** Nunca uma empresa ou vínculo arquivado deve afetar os percentuais ou volumetrias do Dashboard principal do portal.

---

## 3. Autenticação, Autorização e Controle de Acesso

### 3.1 Fluxo de Autenticação
1. Usuário acessa `/auth/login` — Supabase Auth com email/senha
2. O middleware (`middleware.ts`) intercepta **todas** as requisições
3. `updateSession()` renova a sessão JWT a cada request se necessária
4. Sessão inválida ou ausente em rotas protegidas → redirect para `/auth/login?next=<rota>`

### 3.2 Rotas Públicas
- `/` — Redireciona para `/portal/dashboard` (logado) ou `/auth/login` (deslogado)
- `/auth/login` — Tela de login
- `/auth/register` — Redirecionado para `/auth/login` (registro desativado no middleware)
- `/auth/callback` — Callback OAuth
- `/api/csp-report` — Endpoint de relatório de CSP (sem autenticação)

### 3.3 Modelo de Permissões (RBAC)
Dois papéis principais na tabela `profiles`:

| Role | Descrição | Acesso |
|---|---|---|
| `admin` | Administrador | Acesso total a todas as áreas, incluindo `adminOnly` |
| `user` | Colaborador | Acesso controlado por `portal_permissions` |

**`portal_permissions` (mapa JSON):**
- Quando `null` (legado): usuário `user` tem acesso de `edit` a todas as áreas não-admin
- Quando definido: chaves são os `screenKey` (ex: `"acompanhamento"`, `"empresas"`, `"alvaras"`)
- Valores: `"read"` (somente leitura) | `"edit"` (leitura + escrita) | chave ausente = `"none"` (sem acesso)

**Resolução de acesso no middleware (mutações POST/PATCH/PUT/DELETE):**
```
portalScreenRequiredForMutation(pathname) → screenKey → effectivePortalAccess(role, permissions, screenKey)
  → "edit"  → prossegue
  → "none"/"read" → HTTP 403
```

**Verificação de acesso a páginas:**
```
accessForPortalPath(profile, pathname) === "none" → redirect /portal/sem-acesso
```

### 3.4 Rota Especial `sync-all`
`POST /api/companies/sync-all` aceita duas formas de autenticação:
1. Usuário autenticado no portal (sessão válida)
2. Header `Authorization: Bearer <SERVICE_ROLE_KEY>` (para cron jobs externos)

### 3.5 Segurança CORS e CSP
- Requisições com `Origin` inválido são bloqueadas com HTTP 403
- Logs de violação são gravados via `audit_logs`
- Nonce CSP gerado a cada request e injetado nos headers
- Preflight OPTIONS também verificado contra allowlist de origens

---

## 4. Módulo de Empresas

### 4.1 Objetivo da Tela
Cadastrar, consultar, editar e monitorar empresas (clientes). É o ponto de entrada de toda a carteira gerenciada pelo portal.

### 4.2 Dados Capturados no Cadastro

**Campos obrigatórios:**
- `cadastro_tipo` (padrão: `cnpj`) — define regras de validação do documento
- `numero_documento` — identificador principal (único no sistema)

**Validações por tipo de documento:**

| Tipo | Regra de validação |
|---|---|
| `cnpj` | Exatamente 14 dígitos |
| `mei` | Exatamente 14 dígitos (CNPJ do MEI) |
| `caepf` | Exatamente 14 dígitos |
| `cpf` | 11 dígitos + verificação dos dígitos verificadores |
| `outros` | Entre 4 e 20 dígitos |

> **Fonte:** `src/lib/utils.ts` → `normalizeDocumentoForTipo()`

**Campos opcionais preenchidos automaticamente** (quando tipo=`cnpj`|`mei` e sincronização ativa):
- Dados da Receita Federal via BrasilAPI: razão social, nome fantasia, situação, endereço, CNAE, capital social, porte, datas

**Campos de preenchimento manual:**
- `codigo_empresa` — código interno (máx 80 chars), usado como referência interna
- `responsible_user_id` — colaborador responsável (chave `profiles.id`)

### 4.3 Busca e Filtros da Listagem

A listagem usa a view `companies_alvara_summary` com os seguintes filtros disponíveis:
- **Busca textual:** razão social, nome fantasia, código empresa, número do documento
- **Busca por CNPJ completo:** se 14 dígitos, usa `eq` (exato)
- **Filtro por situação cadastral:** `ATIVA`, `INAPTA`, etc.
- **Filtro por município** (múltiplos valores)
- **Filtro por UF**
- **Filtro por status de sync**
- **Filtro por CNAE** (busca nos dígitos extraídos de `cnaes_busca`)
- **Empresas arquivadas** (`arquivadas=1`) — exibe somente arquivadas (separado da lista principal)

**Ordenação suportada:** razão social, nome fantasia, total de alvarás, alvarás vencidos, data de atualização.

**Paginação:** parâmetros `page` (1–100.000) e `limit` (1–100, padrão 20).

### 4.4 Ações na Empresa

| Ação | Efeito | Registro de Histórico |
|---|---|---|
| Criar empresa | Insere em `companies`; se CNPJ/MEI + sincronização ativa, consulta BrasilAPI | — |
| Atualizar empresa | PATCH em `companies` | `cadastro_sync` (se sync) |
| Arquivar empresa | Define `archived_at = now()` | `arquivamento` |
| Restaurar empresa | Define `archived_at = null` | `restauracao` |
| Vincular alvará | POST em `company_alvaras` | `tarefa_vinculada` |
| Desvincular alvará | DELETE em `company_alvaras` | `tarefa_desvinculada` |
| Atualizar código interno | PATCH `codigo_empresa` | `codigo_empresa_atualizado` |

### 4.5 Histórico da Empresa
Cada empresa mantém uma trilha de auditoria em `company_history`:
- **Quem:** `actor_user_id` referenciado ao `profiles`
- **Quando:** `created_at`
- **O quê:** `event_type` + `summary` legível + `metadata` estruturado (JSON)

Eventos relacionados a vínculos de alvarás também são registrados (suspensão, arquivamento, restauração de vínculos e documentos).

### 4.6 Regras de Arquivamento de Empresa
- Empresas arquivadas **não aparecem** na listagem principal
- Empresas arquivadas **não contam** para os indicadores do Dashboard
- O vínculo de alvarás **permanece intacto** após arquivamento
- A restauração remove o `archived_at` e a empresa volta à lista principal
- **NÃO é possível** concluir tarefas de alvarás cujo vínculo esteja arquivado (validado na RPC)

### 4.7 Exportação de Empresas
`GET /api/companies/export` — gera arquivo (CSV ou XLSX) com todos os dados das empresas conforme filtros ativos. Implementado em `src/lib/empresas-export.ts`.

### 4.8 Importação via CSV
`POST /api/companies/import` — importação em lote de empresas via CSV. Implementado em `src/lib/csv-import.ts`. Eventos de rejeição são registrados em `audit_logs` com tipo `csv_import_rejected`.

### 4.9 Responsável pela Empresa
- Campo `responsible_user_id` na tabela `companies`
- Atualização em lote via `POST /api/companies/responsible-batch`
- Usado no Dashboard para calcular a carga de trabalho por responsável

---

## 5. Módulo de Alvarás (Cadastro de Tipos)

### 5.1 Objetivo da Tela
Gerenciar o catálogo de tipos de alvarás monitorados (ex: Alvará de Funcionamento, Licença Sanitária, etc.). É o catálogo mestre que define as regras de renovação.

### 5.2 Grupos de Alvarás (`alvara_groups`)
Organização visual dos tipos de alvarás por segmento:
- **Campos:** nome, descrição, cor (hex), ícone, `is_active`
- **Exemplos iniciais:** Comércio Geral, Área da Saúde, Alimentação e Bebidas, Serviços, Indústria
- Um grupo não pode ser excluído se houver alvarás vinculados (RESTRICT DELETE)

### 5.3 Campos Obrigatórios no Cadastro de Tipo
- `name` — Nome do tipo de alvará
- `frequencia` — Periodicidade de renovação
- `weekend_adjust` — Regra de ajuste de fim de semana

### 5.4 Campos Opcionais mas Críticos
- `prazo_inicio_dias` (padrão: 30) — Com quantos dias de antecedência alertar sobre renovação
- `anexo_obrigatorio` — Exige PDF ao concluir
- `checklist_obrigatorio` — Bloqueia conclusão até checklist completo
- `legal_dia`, `legal_mes`, `legal_dia_semana`, `legal_dias_uteis` — Datas legais fixas (dependem da frequência)

### 5.5 Regras de Inativação
- Tipos inativos (`is_active = false`) **não geram novas tarefas** (verificado em `alvara-task-generation.ts`)
- Tipos inativos **não aparecem** no selector de vínculos
- Vínculos existentes com tipos inativos **mantêm suas tarefas em andamento**

---

## 6. Módulo de Acompanhamento (Kanban)

### 6.1 Objetivo da Tela
Visão operacional diária do status de todos os processos de renovação de alvarás em andamento.

### 6.2 Visualizações Disponíveis
1. **Quadro Kanban** — Cards agrupados em colunas por status
2. **Lista** — Tabela estruturada com todos os campos
3. **Calendário** — Alvarás agrupados por data de vencimento (`due_date`)

### 6.3 Colunas do Kanban e Status Físicos

| Coluna Visual | Status no Banco | Descrição |
|---|---|---|
| **Pendente** | `pendente` | Aguardando início da renovação |
| **Em Andamento** | `em_andamento` | Renovação em curso |
| **Com Impedimento** | `com_impedimento` | Processo travado por pendência externa |
| **Concluído** | `concluida` | Alvará emitido com sucesso |
| **Canceladas** | `cancelada` | Processo descontinuado |

> **Mudança Importante (v2):** O banco de dados agora suporta os 5 status fisicamente. A versão anterior usava `localStorage` para simular "Em Andamento" e "Com Impedimento" como sub-colunas do status `pendente`. Na versão atual, todos os status são persistidos diretamente no banco.

#### 6.3.1 Comportamento de Empresas ou Vínculos Arquivados no Kanban
Para garantir o rigor no compliance e evitar andamentos operacionais indevidos:
- **Ocultação Padrão:** Tarefas associadas a empresas ou vínculos arquivados são ocultadas do Kanban na operação diária convencional.
- **Visualização Excepcional:** Só aparecem em tela quando o utilizador ativa explicitamente o filtro **"Mostrar arquivados"** na barra lateral.
- **Travamento de Operações:** Uma vez exibidos sob filtro, os cards de vínculos/empresas arquivados recebem um badge cinza destacado **"Arquivado"** e ficam com suas **movimentações e conclusões estritamente bloqueadas** por validação em tela e no backend.

### 6.4 Raias Horizontais (Swimlanes)
Agrupamento opcional das tarefas no Kanban:
- **Por Empresa** — Uma raia por CNPJ/cliente
- **Por Responsável** — Uma raia por colaborador (`responsible_user_id`)

Estados expandidos/recolhidos são persistidos em `localStorage`:
- Chave: `"notifique-acompanhamento-collapsed-swimlanes"`
- Chave do tipo de raia ativa: `"notifique-acompanhamento-swimlane"`

### 6.5 Regra de Visibilidade de 90 Dias
- Tarefas com `due_date > hoje + 90 dias` são **ocultas por padrão**
- Objetivo: evitar poluição visual no painel de trabalho diário
- Para visualizá-las: filtro especial **"Ocultos (> 90 dias)"** na seleção de período

### 6.6 Informações Exibidas em Cada Card

| Campo | Origem |
|---|---|
| Nome da empresa | `companies.razao_social` ou `nome_fantasia` |
| Tipo de alvará | `alvaras.name` |
| Grupo do alvará | `alvara_groups.name` + `color` |
| Data de vencimento | `alvara_tasks.due_date` |
| Status dinâmico | Calculado em `src/lib/utils.ts` → `getTaskStatusMeta()` |
| Responsável | `companies.responsible` (join com `profiles`) |
| Progresso da checklist | % de etapas concluídas |
| Protocolo | `alvara_tasks.protocolo` |

### 6.7 Regras de Movimentação entre Colunas

**Transições permitidas:**

| De → Para | Regras |
|---|---|
| `pendente` → `em_andamento` | Livre (PATCH status) |
| `pendente` → `com_impedimento` | Livre (PATCH status) |
| `pendente` → `cancelada` | Livre; exige `cancellation_reason` |
| `em_andamento` → `pendente` | Recuo permitido |
| `em_andamento` → `com_impedimento` | Livre; exige `impediment_reason` |
| `em_andamento` → `concluida` | **Fluxo especial** — ver §8.3 |
| `em_andamento` → `cancelada` | Exige `cancellation_reason` |
| `com_impedimento` → `pendente` | Recuo permitido |
| `com_impedimento` → `em_andamento` | Retomada do processo |
| `com_impedimento` → `concluida` | **Fluxo especial** — ver §8.3 |
| `com_impedimento` → `cancelada` | Exige `cancellation_reason` |
| `concluida` → qualquer | **BLOQUEADO** (irreversível) |
| `cancelada` → qualquer | **BLOQUEADO** (irreversível) |

> **Regra:** Qualquer tentativa de alterar uma tarefa já `concluida` ou `cancelada` retorna HTTP 400 com mensagem `"Esta tarefa já foi encerrada e não pode sofrer novas alterações."`.

**Validação de combinação de status (backend):** `src/lib/validations/alvara-status.ts → validarCombinacaoStatus()` — valida se a combinação de status da tarefa e do vínculo é permitida antes de persistir.

### 6.8 Cancelamento de Tarefas
- Requer preenchimento do `cancellation_reason`
- Grava `cancelled_at` e `cancelled_by`
- Registra evento `status` no histórico (`de: <status_anterior>`, `para: cancelada`)
- **Não gera nova tarefa** de renovação (apenas conclusão gera)

### 6.9 Regras de Prioridade
Valores possíveis: `baixa`, `media` (padrão), `alta`, `critica`.
- A prioridade é um campo informativo para ordenação e destaque visual
- Não bloqueia nem altera o fluxo automático de renovação

### 6.10 Gatilhos ao Concluir uma Tarefa
Ao mover para `concluida`, uma cadeia de operações é executada **dentro de uma transação SQL** (`complete_alvara_task` RPC — ver §8.3 e §16).

---

## 7. Módulo de Dashboard

### 7.1 Objetivo da Tela
Visão executiva e gerencial em tempo real da saúde da carteira de alvarás.

### 7.2 Fonte de Dados
Endpoint único: `GET /api/stats` — realiza **12 queries paralelas** ao banco e consolida os KPIs na memória do servidor antes de retornar.

### 7.3 KPIs e Indicadores

#### 7.3.1 Índice de Conformidade Geral (Compliance Rate)

$$\text{Conformidade} = \left( \frac{\text{Empresas Ativas Regulares}}{\text{Total de Empresas Ativas}} \right) \times 100$$

* **Definição de Empresa Regular:** Uma empresa é regular se possui todos os seus alvarás vinculados com status documental de `'vigente'`, `'indeterminado'` ou `'dispensado'`. Se houver **qualquer** vínculo em status `'vencido'` ou `'sem_documento'`, a empresa é classificada como **Irregular**.
* **Tratamento de Vínculos Suspensos:** Vínculos marcados com `monitoring_status = 'suspenso'` são **excluídos de forma absoluta** de todos os cálculos de conformidade (numerador e denominador), pois seu monitoramento está congelado e não deve impactar a conformidade operacional.
* **Tratamento de Vínculos Dispensados:** Vínculos com `is_exempt = true` ou `monitoring_status = 'dispensado'` recebem o status documental próprio de **`"dispensado"`**. Eles não exigem comprovantes, não contam como vencidos nem como sem_documento, e contam favoravelmente como **Regular por Dispensa**.
* **Numerador:** Quantidade de empresas sem `archived_at` que possuem todos os vínculos ativos regulares (ou seja, `alvaras_vencidos === 0` **E** `alvaras_sem_documento === 0`, desconsiderando links suspensos).
* **Denominador:** Total de empresas ativas (sem `archived_at`). Empresas criadas sem nenhum alvará vinculado contam no denominador mas não no numerador (atuando como incentivo direto para amarração das obrigações).

#### 7.3.2 Top 5 Empresas Críticas
- Empresas com maior número de `alvaras_vencidos`
- Filtradas (`vencidos > 0`), ordenadas decrescente, limitadas a 5

#### 7.3.3 Projeção de Vencimentos (30/60/90 dias)
- Fonte: `company_alvara_documents` com `is_current = true`, `expiration_date BETWEEN hoje AND hoje+90`
- Separados em 3 baldes: `count30` (≤ 30 dias), `count60` (31–60 dias), `count90` (61–90 dias)

#### 7.3.4 Throughput de Tarefas e Eficiência Operacional
Para evitar distorções entre períodos e misturas de "safras" de processos criados e fechados, o Dashboard adota três métricas independentes de vazão operacional mensal (período: 1.º ao último dia do mês corrente, filtrado por `created_at` ou `completed_at`):

* **Throughput Mensal Bruto:** Quantidade absoluta de tarefas concluídas no mês corrente (`completed_at` dentro do mês), independentemente de quando as tarefas foram originalmente criadas.
* **Taxa de Conclusão de Safra:** Mede a eficácia de fechamento dos processos criados na mesma janela mensal:
  $$\text{Taxa de Conclusão da Safra} = \left( \frac{\text{Tarefas criadas no mês E já concluídas}}{\text{Total de tarefas criadas no mês}} \right) \times 100$$
* **Eficiência Operacional:** Mede a vazão de trabalho real sobre o volume passível de resolução no período:
  $$\text{Eficiência Operacional} = \left( \frac{\text{Tarefas concluídas no mês}}{\text{Tarefas ativas ou vencendo no mês}} \right) \times 100$$

#### 7.3.5 Distribuição do Backlog de Tarefas (Backlog Ativo)
O backlog ativo mede o volume de trabalho em aberto sob responsabilidade operacional direta da equipe.
* **Filtro de Backlog Ativo:** Considera estritamente tarefas com status atrativo de andamento:
  - `'pendente'`
  - `'em_andamento'`
  - `'com_impedimento'`
* **Exclusão de Histórico:** As tarefas com status `'concluida'` e `'cancelada'` são consideradas **Estados Terminais/Históricos** e são **excluídas** de qualquer contagem ou distribuição de backlog ativo geral do Dashboard, contando exclusivamente para relatórios de produtividade retroativa.

#### 7.3.6 Carga de Trabalho por Responsável
- Total de empresas por `responsible_user_id` (join com `profiles.display_name`)
- Empresas sem responsável agrupadas como "Sem Responsável"
- Ordenado decrescente por quantidade

#### 7.3.7 Concentração Geográfica por UF
- Contagem de alvarás vinculados por UF da empresa
- Soma de `total_alvaras` por estado

#### 7.3.8 Histórico Sazonal (6 Meses)
- Gráfico de linha dos últimos 6 meses
- Dois indicadores por mês: `created` (novos processos) e `completed` (concluídos)
- Fonte: `alvara_tasks` com `created_at >= 6 meses atrás`

#### 7.3.9 Taxa de Cobertura Documental

$$\text{Cobertura} = \left( \frac{\text{Vínculos com arquivo PDF anexado}}{\text{Total de vínculos ativos}} \right) \times 100$$

- Fonte: `company_alvara_documents` com `is_current = true`; conta os que têm `file_path` não nulo

#### 7.3.10 Alvarás com Validade Indeterminada
- Contagem de documentos com `is_current = true` e `is_indefinite = true`
- Representa documentos permanentes (sem data de expiração)

#### 7.3.11 Score de Regularidade de Alvarás

$$\text{Score} = \left( \frac{\text{Total de Vínculos Monitorados} - \text{Vínculos Vencidos}}{\text{Total de Vínculos Monitorados}} \right) \times 100$$

* **Visão Geral:** Visão de saúde individualizada de todas as obrigações cadastradas no portal, **independente do agrupamento por CNPJ**.
* **Definições de Filtro de Regularidade:**
  - **Total de Vínculos Monitorados:** Considera apenas vínculos ativos no sistema (sem `archived_at` e excluindo estritamente vínculos marcados com `monitoring_status = 'suspenso'`).
  - **Vínculos Vencidos:** Quantidade de vínculos ativos que possuem status documental de `'vencido'`. Vínculos em status `'dispensado'` ou com validade indeterminada `'indeterminado'` **não** são contados como vencidos, integrando a contagem de regularidade.

#### 7.3.12 Alvarás por Categoria (Grupo)
- Distribuição dos documentos vigentes por `alvara_groups.name`
- Inclui cor do grupo para visualização em gráfico de pizza

#### 7.3.13 Vencendo nos Próximos 30 Dias (Lista)
- Lista dos 5 alvarás mais urgentes (ordenados por `expiration_date`)
- Inclui: empresa, tipo de alvará, número, data de vencimento

### 7.4 Filtros Aplicáveis no Dashboard
O dashboard exibe dados em tempo real. Não há filtros de período configuráveis na tela — os dados sempre refletem o estado atual.

### 7.5 Atualização dos Indicadores
- Os dados são buscados no carregamento da página e podem ser atualizados manualmente via recarregamento
- Não há polling ou WebSocket em tempo real

---

## 8. Ciclo de Vida de uma Tarefa

### 8.1 Criação de Tarefa
Tanto a rotina automática em lote (`POST /api/alvara-tasks`) quanto os fluxos de criação individual e renovação automática seguem uma premissa rígida de **segurança contra duplicidade de backlog operacional**:

1. **Busca de Vínculos:** O sistema varre todos os `company_alvaras` ativos (sem `archived_at` e com `monitoring_status = 'ativo'`).
2. **Checagem de Backlog Ativo:** Para cada vínculo, verifica-se a existência de **qualquer tarefa operacional aberta**. Uma tarefa é considerada aberta se seu status for um dos seguintes:
   - `'pendente'`
   - `'em_andamento'`
   - `'com_impedimento'`
3. **Criação Segura:** Uma nova tarefa com status `'pendente'` e `due_date = null` só é inserida se **não houver nenhuma outra tarefa aberta** associada àquele vínculo.
4. **Resolução de Datas Iniciais:** O prazo limite de início para o primeiro ciclo é calculado somando o prazo regulamentar do catálogo à data base:
   $$\text{inicio\_obrigatorio\_ate} = \text{data\_criacao} + \text{alvaras.prazo\_inicio\_dias}$$
   
> [!WARNING]
> **Bloqueio de Duplicidade:** Índices únicos físicos no banco de dados impedem de forma absoluta a gravação de múltiplos cards ativos de renovação ou tarefas pendentes sem data para um mesmo vínculo, blindando o Kanban contra duplicidades operacionais. Não são feitas escritas de novas datas nos campos legados de `company_alvaras` durante este fluxo.

### 8.2 Atualização de Status Normal
`PATCH /api/alvara-tasks/[id]` — Atualização de status, notas, protocolo:

1. Verifica que tarefa existe e não está `concluida`/`cancelada`
2. Valida a combinação de status com `validarCombinacaoStatus()`
3. Aplica patch com `updated_at`, status, campos específicos por status
4. Registra evento no `alvara_task_history`

### 8.3 Conclusão de Tarefa (Fluxo Crítico)

Acionar `PATCH /api/alvara-tasks/[id]` com `status: "concluida"` dispara o seguinte fluxo:

**Validações de backend (antes da transação):**
1. `notes` não pode estar vazio — obrigatório para concluir
2. `issue_date` é obrigatório
3. `expiration_date` é obrigatório (salvo `is_indefinite = true`)
4. `expiration_date >= issue_date` (não pode vencer antes de emitir)
5. Se `checklist_obrigatorio = true` → todas as etapas devem estar marcadas
6. Verificação delegada para `validateChecklistObrigatoriaForTask()`

**Execução da RPC transacional `complete_alvara_task()`:**

```sql
BEGIN TRANSACTION
  1. SELECT FOR UPDATE na tarefa → Trava concorrência
  2. Valida status do vínculo (não arquivado, não suspenso)
  3. Valida parâmetros de entrada (datas, arquivo obrigatório)
  4. UPDATE company_alvara_documents SET is_current = false (documentos anteriores)
  5. INSERT INTO company_alvara_documents (novo documento vigente)
  6. UPDATE alvara_tasks SET status = 'concluida', result_document_id, completed_at, completed_by
  7. INSERT INTO alvara_task_history (evento 'completed')
  8. INSERT INTO company_alvara_document_history (evento 'document_created')
  9. SE is_indefinite → RETURN (não gera nova tarefa)
  10. SE frequencia = 'personalizada' → RETURN (renovação manual)
  11. Calcula v_next_due = expiration_date
  12. Calcula v_next_start_after = v_next_due - prazo_inicio_dias (com ajuste de fim de semana)
  13. SE não existe tarefa de renovação aberta para v_next_due:
      INSERT INTO alvara_tasks (nova tarefa, status='pendente', due_date=v_next_due)
COMMIT
```

**Em caso de erro:** O erro é capturado no backend, registrado em `lifecycle_errors` e retornado como HTTP 400.

### 8.4 Cancelamento de Tarefa
- Requer `cancellation_reason`
- Grava `cancelled_at` + `cancelled_by` + `cancellation_reason`
- Estado `cancelada` é **irreversível**
- **NÃO gera nova tarefa de renovação**

---

## 9. Status Dinâmicos de Alvarás e Tarefas

A regularidade documental e operacional do sistema é controlada por status dinâmicos calculados em tempo real na biblioteca pura de status (`src/lib/alvara-status.ts`). 

### 9.1 Status Operacionais da Tarefa (`computeTaskStatus()`)
A função resolve a data limite (`limitDate`) e cruza o carimbo de data atual (`hoje`) ou conclusão (`completed_at`) para retornar um dos 10 status exatos abaixo:

| Status Físico | Condição de Vencimento | Comportamento Visual / Significado |
|---|---|---|
| `sem_tarefa_aberta` | — | Nenhuma tarefa em andamento ou pendente cadastrada para o vínculo. |
| `cancelada` | — | Tarefa cancelada administrativamente pelo utilizador (`status = 'cancelada'`). |
| `concluida` | `completed_at <= limitDate` | Tarefa finalizada com sucesso dentro do prazo regulamentar. |
| `concluida_vencida` | `completed_at > limitDate` | Tarefa concluída, mas com data de conclusão posterior ao limite. |
| `em_andamento` | `limitDate >= hoje` ou sem data | Tarefa em curso, com prazo futuro ou sem vencimento definido. |
| `em_andamento_vencida` | `limitDate < hoje` | Tarefa em curso com prazo de vencimento já ultrapassado. |
| `com_impedimento` | `limitDate >= hoje` ou sem data | Tarefa pausada por impedimento externo, ainda dentro do prazo. |
| `com_impedimento_vencida` | `limitDate < hoje` | Tarefa suspensa por impedimento, com prazo já vencido. |
| `pendente` | `limitDate >= hoje` ou sem data | Renovação não iniciada, com prazo futuro ou a definir. |
| `pendente_vencida` | `limitDate < hoje` | Renovação não iniciada com o prazo regulamentar expirado. |

### 9.2 Lógica de Resolução da Data Limite (`limitDate`)
Para o cálculo de atrasos e expirações operacionais, o sistema tenta obter o `limitDate` da tarefa através da seguinte precedência de fallback:
```typescript
limitDate = task.due_date 
  ?? task.inicio_obrigatorio_ate 
  ?? task.company_alvaras.data_vencimento -- [LEGADO - FALLBACK APENAS]
```

> [!WARNING]
> **Campo Legado [LEGADO]:** O campo `company_alvaras.data_vencimento` é estritamente legado. Sua leitura na fórmula acima atua puramente como uma compatibilidade retroativa para dados antigos legados importados. Ele **não** é fonte oficial de dados operacionais ou de conformidade documental no Dashboard.

### 9.3 Lógica de Fallback para Primeiro Ciclo (Sem Emissão Cadastrada)
Se a tarefa estiver no status `'pendente'` e **não possuir** um `limitDate` definido (cenário comum na primeira carga de tarefas em lote):
1. O sistema verifica se o vínculo possui uma data de emissão histórica (`company_alvaras.data_emissao` preenchido — **[LEGADO - FALLBACK APENAS]**).
2. Se **não houver data de emissão**:
   - Pega o prazo do catálogo (`alvaras.prazo_inicio_dias`, padrão: `30` dias, limitado entre `1` e `3650`).
   - Pega a data base de criação da tarefa (`task.created_at` ou `hoje` se nulo).
   - Calcula a estimativa de prazo de início (`prazoInicio`) somando os dias de antecedência à data base.
   - Se `prazoInicio < hoje`, o status computado é **`pendente_vencida`**; caso contrário, é **`pendente`**.

---

## 10. Cálculo de Frequências e Datas de Vencimento

### 10.1 Frequências Suportadas

| Slug | Label | Método de Cálculo |
|---|---|---|
| `diaria` | Diária | `emissão + 1 dia` |
| `semanal` | Semanal | Próximo `legal_dia_semana` após emissão |
| `decendial` | Decendial | `emissão + 10 dias` |
| `mensal` | Mensal | `emissão + 1 mês` |
| `bimestral` | Bimestral | `emissão + 2 meses` |
| `trimestral` | Trimestral | `emissão + 3 meses` |
| `semestral` | Semestral | `emissão + 6 meses` |
| `anual` | Anual | `emissão + 12 meses` |
| `personalizada` | Personalizada | **Renovação Manual:** Sem data calculada automaticamente (planejamento inteiramente manual) |

> [!IMPORTANT]
> **Regra Oficial da Frequência Personalizada:**
> Quando a periodicidade de um vínculo de alvará for marcada como `'personalizada'`:
> 1. O operador deve indicar a data de vencimento de forma estritamente **manual** no formulário de conclusão do ciclo operacional.
> 2. A RPC de conclusão do banco de dados (`complete_alvara_task`) **não** realiza o cálculo matemático automático do próximo vencimento.
> 3. O sistema **não** gera automaticamente a tarefa de renovação pendente para o ciclo seguinte.
> 4. Toda e qualquer renovação subsequente deste vínculo deve ser programada e registrada manualmente pela equipe de gestão.

> **Função principal:** `computeVencimentoDate()` em `src/lib/alvara-frequency.ts`

### 10.2 Ajuste de Fim de Semana

Aplicado **após** o cálculo da data bruta:

| Modo | Sábado | Domingo |
|---|---|---|
| `none` | Sem ajuste | Sem ajuste |
| `postpone` | +2 dias (segunda) | +1 dia (segunda) |
| `anticipate` | -1 dia (sexta) | -2 dias (sexta) |

> **Função:** `applyWeekendAdjust()` em `src/lib/alvara-frequency.ts`

### 10.3 Prazo de Início (`prazo_inicio_dias`)
- Parâmetro do tipo de alvará (padrão: 30, range: 1–3650)
- No 1.º ciclo: `inicio_obrigatorio_ate = created_at + prazo_inicio_dias`
- Nos ciclos seguintes: `start_after = due_date - prazo_inicio_dias` (com ajuste de fim de semana conforme RPC)

### 10.4 Cadeia de Vencimentos
Para calendário e projeções, a função `listVencimentosEmCadeia()` gera todos os vencimentos futuros a partir de uma data de emissão inicial, iterando pelas periodicidades.

---

## 11. Sistema de Documentos (company_alvara_documents)

### 11.1 Modelo de Documento Vigente
- **Apenas um documento pode ser `is_current = true`** por vínculo (índice único)
- Ao concluir uma tarefa, o documento anterior é marcado `is_current = false, replaced_at = now()`
- O novo documento é inserido como `is_current = true`

### 11.2 Lógica de Documento Ativo para Dashboard
Um alvará é considerado **ativo/emitido** (Regular) para fins de KPI se possui status documental `'vigente'`, `'indeterminado'` ou `'dispensado'`.

> [!IMPORTANT]
> **[REGRA CORRIGIDA] Vínculos Dispensados:** Vínculos com `is_exempt = true` ou `monitoring_status = 'dispensado'` recebem o status documental próprio de **`"dispensado"`**. Eles **nunca** devem ser computados ou exibidos como `'sem_documento'`, `'pendente'` ou `'vencido'`.

```typescript
// src/lib/alvara-status.ts → computeDocumentStatus(vinculo, currentDoc)
if (vinculo.monitoring_status === 'dispensado' || vinculo.is_exempt === true) {
  return "dispensado"; // Status documental próprio para isenção/dispensa
}
if (!currentDoc) {
  return "sem_documento";
}
if (currentDoc.is_indefinite) {
  return "indeterminado";
}
if (currentDoc.expiration_date >= hoje) {
  return "vigente";
}
return "vencido";
```

### 11.3 Validade Indeterminada
- `is_indefinite = true` + `expiration_date = null`
- Não gera nova tarefa de renovação automática
- Status: `indeterminado` (não conta como vencido)

---

## 12. Checklist por Tipo de Alvará

### 12.1 Configuração
- Cada tipo de alvará pode ter uma lista de etapas (`alvara_checklist_items`)
- Se `checklist_obrigatorio = true`: todas as etapas devem estar concluídas para fechar a tarefa

### 12.2 Progresso por Tarefa
- Tabela `alvara_task_checklist_progress` — estado por tarefa × item
- Campos: `completed` (boolean), `comment` (texto), `attachment_url` (URL de anexo)

### 12.3 Validação no Backend
`validateChecklistObrigatoriaForTask()` — executada antes da RPC de conclusão:
1. Busca todos os itens do tipo de alvará
2. Cruza com o progresso da tarefa específica
3. Se algum item não está marcado como `completed = true` → retorna mensagem de erro

### 12.4 Registro de Histórico de Checklist
Cada marcação/desmarcação de etapa gera um evento `checklist` no `alvara_task_history`:
- `completed: true` → "✅ Etapa «label» concluída em HH:MM"
- `completed: false` → "↩️ Etapa «label» reaberta"
- Inclui comentário e flag de anexo quando presentes

### 12.5 Templates de Checklist
- `alvara_checklist_templates` — templates reutilizáveis criados pelos usuários
- Podem ser criados a partir de um tipo de alvará existente
- Aplicados via `POST /api/checklist-templates`

---

## 13. Upload de Arquivos e Evidências

### 13.1 Tipos de Arquivo Permitidos
- PDF
- PNG, JPEG, WebP
- Limite: **10 MB** por arquivo

### 13.2 Processo de Upload (Duplo Canal)
Implementado em `src/lib/upload-task-attachment.ts`:

1. **Presign (preferido):** `POST /api/alvara-tasks/[id]/attachment` → retorna URL presignada do R2 → `PUT` direto ao R2
2. **Fallback multipart:** se presign falhar ou retornar erro → `POST` com `FormData` ao endpoint da API

### 13.3 Anexo Oficial do Alvará (Documento Emitido)
Representa o arquivo físico do alvará gerado de forma oficial ao término do ciclo operacional da tarefa.
* **Destino de Gravação:** Salvo na tabela `company_alvara_documents.file_path`.
* **Gatilho de Upload:** Enviado juntamente com a requisição transacional de conclusão de tarefa (`PATCH` de conclusão com `status = 'concluida'`).
* **Regras de Compliance:**
  - Se a coluna `alvaras.anexo_obrigatorio` estiver marcada como `true`, a tarefa **não** poderá ser concluída sem o upload do arquivo oficial.
  - Este documento entra diretamente nos indicadores do Dashboard operacional como **Comprovante de Regularidade**.

### 13.4 Evidência de Apoio Operacional
Representa arquivos intermediários carregados durante o andamento da tarefa (ex: taxa de alvará paga, protocolo de agendamento em órgão público, print de exigência ou foto física da vistoria).
* **Destino de Gravação:** Gravado de forma informativa no histórico operacional (`alvara_task_history.metadata.evidence_attachments`).
* **Gatilho de Upload:** Enviado em chamadas parciais durante o ciclo ativo da tarefa (via array `evidence_attachments[]` no PATCH de atualização de notas do operador).
* **Regras de Compliance:**
  - **Nunca** substitui ou assume a validade de um documento oficial do alvará.
  - **Não** entra nos indicadores de Cobertura Documental ou conformidade regulamentar do Dashboard.
  - Fica estritamente bloqueado o upload ou alteração de qualquer evidência caso a tarefa correspondente já esteja em um status terminal (`concluida` ou `cancelada`).

#### 13.4.1 Tipos de Eventos de Evidência no Histórico
Para evitar misturas genéricas de termos, o sistema abandona eventos de upload genéricos e os mapeia de duas formas distintas:
1. **Comentário Operacional com Evidências:** Quando o operador insere notas de andamento com um ou mais arquivos de suporte anexados.
   - `event_type = 'notes'`
   - `metadata.evidence_attachments[]` contendo os caminhos do Cloudflare R2.
2. **Carregamento de Evidência Isolada (Sem Comentários):**
   - `event_type = 'evidence_attached'`
   - Gravação dos metadados brutos do arquivo em `metadata`.

---

## 14. Histórico e Auditoria

### 14.1 Histórico de Tarefa (`alvara_task_history`)
Cada operação relevante em uma tarefa gera um registro:

| Evento | Gerador | Conteúdo |
|---|---|---|
| `created` | Trigger SQL `trg_alvara_task_created_hist` | Status inicial, due_date |
| `status` | PATCH API (mudança de status) | `de`, `para`, `motivo` |
| `notes` | PATCH API (atualização de notas) | `anterior`, `novo`, lista de evidências |
| `attachment` | PATCH API (arquivo ao vínculo) | `anterior` (URL), `novo` (URL) |
| `due_date` | Admin (alteração manual de prazo) | Summary descritivo |
| `system` | RPC `complete_alvara_task` | `data_vencimento` (do documento), `data_emissao` (do documento), `proxima_data` (da nova tarefa) — **[REGRA CORRIGIDA]** |
| `checklist` | POST /api/alvara-tasks/[id]/checklist | `label`, `completed`, `comment`, `attachment_url` |

### 14.2 Apresentação do Histórico
`src/lib/alvara-task-history-present.ts → linhasHistoricoTarefa()`:
- Converte eventos brutos (JSON) em texto legível em português
- Remove dados técnicos internos da exibição ao usuário

### 14.3 Histórico Documental (`company_alvara_document_history`)
- Trilha de auditoria específica dos documentos emitidos
- Gerado automaticamente dentro da RPC `complete_alvara_task`

### 14.4 Histórico da Empresa (`company_history`)
- Registrado pelo backend via `logCompanyHistory()` nas operações de vínculo e cadastro
- Visível na aba Histórico do cadastro da empresa

### 14.5 Logs de Segurança (`audit_logs`)
- Eventos de autenticação, autorização e operações sensíveis
- Emitidos também em stdout (stdout streaming compatível com ferramentas SIEM)

---

## 15. Sincronização com Receita Federal (BrasilAPI)

### 15.1 Sincronização Individual (Cadastro)
Quando uma empresa é criada com `cadastro_tipo = 'cnpj'` ou `'mei'` e `sincronizar_receita = true`:
1. `upsertCompanyByCNPJ()` consulta `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`
2. Mapeia os dados para o modelo `Company` via `mapBrasilAPIToCompany()`
3. Faz `upsert` em `companies` com `onConflict: 'numero_documento'`

**Estados de sync_status:**
- `'pending'` — Aguardando primeira sincronização
- `'ok'` — Sincronizado com sucesso
- `'error'` — Erro na consulta à BrasilAPI
- `'not_found'` — CNPJ não encontrado na Receita Federal
- `'manual'` — Cadastro manual, sem consulta à BrasilAPI

### 15.2 Sincronização em Massa (`sync-all`)
`POST /api/companies/sync-all` — Executa sincronização de todas as empresas conforme configuração em `sync_config`:
- `sync_enabled` — Liga/desliga sincronização
- `sync_time` — Horário programado (para crons externos)
- `date_start`, `date_end` — Filtro por data de abertura
- `only_active` — Somente empresas com `situacao_cadastral = 'ATIVA'`

Resultados registrados em `sync_logs`:
- `total`, `success`, `errors`, `skipped`
- `triggered_by`: `'cron'` (automático) ou `'manual'` (usuário)

### 15.3 Sincronização Única por Empresa
`POST /api/companies/sync-single` — Força sincronização de uma empresa específica.

---

## 16. Ciclo de Renovação Automática

### 16.1 Diagrama do Fluxo

```
Tarefa Atual (Em Andamento ou Com Impedimento)
       │
       ▼ [Usuário conclui: PATCH status='concluida' + issue_date + expiration_date]
       │
       ▼ RPC complete_alvara_task() (TRANSAÇÃO ATÔMICA)
       │
       ├─► 1. Marca documentos anteriores como is_current=false
       ├─► 2. Insere novo company_alvara_document (is_current=true)
       ├─► 3. Marca tarefa atual como concluída
       ├─► 4. Insere histórico da tarefa e histórico documental
       │
       ├─[is_indefinite=true]──► ENCERRA (sem nova tarefa)
       ├─[frequencia='personalizada']──► ENCERRA (renovação manual)
       │
       └─► 5. Calcula v_next_due = expiration_date
           6. Calcula v_next_start_after = expiration_date - prazo_inicio_dias
           7. SE não existe tarefa aberta com due_date=v_next_due:
              INSERT INTO alvara_tasks (status='pendente', due_date=v_next_due, start_after=v_next_start_after)
```

### 16.2 Regras da Nova Tarefa Automática
- `due_date` = `expiration_date` do documento recém emitido
- `start_after` = `v_next_due - prazo_inicio_dias` (ajustado por `weekend_adjust`)
- `task_type = 'renovacao'`
- `status = 'pendente'`
- Apenas criada se **não existir** outra tarefa de renovação aberta para o mesmo `due_date` (prevenção de duplicidade)

### 16.3 Impacto no Dashboard
- O novo documento vigente é computado imediatamente como `vigente` ou `indeterminado`
- A nova tarefa aparece no Kanban como `Pendente`
- A empresa não perde seu status de conformidade enquanto o documento vigente não expirar

---

## 17. Gatilhos Automáticos do Banco de Dados

### 17.1 `trg_*_upd` — Atualização de `updated_at`
Disparados em `BEFORE UPDATE` em todas as tabelas principais:
- `companies`, `alvara_groups`, `alvaras`, `company_alvaras`
- `alvara_tasks`, `alvara_checklist_items`, `alvara_task_checklist_progress`
- `sync_config`, `profiles`

**Função:** `set_updated_at()` → `new.updated_at = now()`

### 17.2 `trg_alvara_task_created_hist` — Histórico Automático de Criação
Disparado `AFTER INSERT` em `alvara_tasks`:
```sql
INSERT INTO alvara_task_history (task_id, event_type, summary, metadata)
VALUES (new.id, 'created', 'Tarefa criada', {'due_date': ..., 'status': ...})
```
Registra automaticamente a criação de toda nova tarefa no histórico.

### 17.3 `on_auth_user_created` — Criação Automática de Perfil
Disparado `AFTER INSERT` em `auth.users`:
```sql
INSERT INTO public.profiles (id, display_name)
VALUES (new.id, COALESCE(raw_user_meta_data->>'display_name', email_prefix))
ON CONFLICT (id) DO NOTHING
```
Garante que todo novo usuário Supabase Auth receba um perfil público automaticamente.

---

## 18. Segurança e Controle de Acesso à API

### 18.1 Row Level Security (RLS)
Todas as tabelas do banco de dados PostgreSQL no Supabase possuem RLS ativado. O sistema separa de forma estrita e inequívoca o **Estado Atual Implementado** da **Diretriz de Evolução (Planejamento)**, de modo que nenhuma diretriz de planejamento futuro seja confundida com a segurança física atualmente ativa no banco de dados.

> [!WARNING]
> **Diferenciação Crítica de Status [REGRA CORRIGIDA]:** A camada de banco de dados física atual **NÃO** impõe isolamento de multitenancy ou validações de chaves RBAC de nível de linha por si só. Toda a lógica de permissões granulares por tela e de restrição de acesso a dados é operada de maneira robusta e centralizada na **camada de aplicação** (Next.js Middleware e API Routes). Qualquer menção a RLS refinada por responsável ou permissão de tela no banco de dados é estritamente uma diretriz de evolução futura e não está implementada em produção.

#### 18.1.1 Estado Atual Implementado (Camada de Segurança Ativa)
Atualmente, o banco de dados impõe políticas de acesso amplo a qualquer conta autenticada, delegando o controle de permissões granular por tela à camada de aplicação (Next.js Middleware + API Routes):
```sql
CREATE POLICY "auth_full" ON <table> FOR ALL USING (auth.role() = 'authenticated');
```
* **Comportamento:** A camada de aplicação valida as chaves de tela e níveis de acesso antes de executar operações na base.
* **Exceções Críticas Ativas no Banco (Segurança de Baixo Nível):**
  - **`profiles`:** Sem política pública de mutação; qualquer escrita direta pelo client é bloqueada, sendo realizada exclusivamente via `service_role` através do endpoint protegido `/api/users`.
  - **`lifecycle_errors`:** Protegida com a diretiva `USING (false)` $\rightarrow$ escrita e leitura bloqueadas de forma física para qualquer usuário autenticado; acessada estritamente via `service_role` pelo backend (expondo dados sanitizados para a timeline).
  - **`audit_logs`:** Acesso direto bloqueado; gravada via triggers de sistema e `service_role`.
  - **`alvaras` (Catálogo):** Escrita bloqueada para usuários comuns; mutações permitidas apenas para administradores autenticados.

#### 18.1.2 Diretriz de Evolução (Segurança Futura e Planejamento - NÃO IMPLEMENTADO)
Como planejamento de arquitetura de longo prazo para mitigar riscos de chamadas diretas ou maliciosas ao banco via SDK do Supabase, as seguintes diretrizes de segurança a nível de banco de dados (RLS) estão projetadas (atualmente não ativas no ambiente de produção):
* **RLS Multitenancy (Futuro):** Mapear o RLS de `companies` e `alvara_tasks` de forma que um colaborador comum (`role = 'user'`) consiga realizar `SELECT` apenas nos registros pertencentes à sua carteira designada (cruzando `responsible_user_id` ou `assigned_to` com seu `auth.uid()`).
* **RLS Baseado em Chaves de Tela (Futuro):** Mapear os privilégios de escrita (`INSERT`/`UPDATE`/`DELETE`) diretamente nas tabelas de banco de dados através do cruzamento dinâmico com o payload da coluna `portal_permissions` da tabela `profiles`, validando na base se o usuário possui a chave `'edit'` ativa para a respectiva tela.

### 18.2 CORS e Origin
- Lista de origens permitidas configurada em `src/lib/security/api-cors.ts`
- Requisições com `Origin` fora da allowlist → HTTP 403
- Loga evento `security_blocked_origin` em `audit_logs`

### 18.3 Content Security Policy (CSP)
- Nonce gerado por request (`createRequestNonce()`)
- Headers de segurança aplicados por `applySecurityHeaders()` em todas as respostas
- Violações reportadas em `/api/csp-report` e armazenadas em `audit_logs`

### 18.4 Sanitização de Input
`sanitizeText()` em `src/lib/utils.ts`:
- Remove tags HTML para prevenir XSS
- Aplicado em `notes`, `cancellation_reason`, `impediment_reason`, `protocolo`

---

## 19. Simulação do Fluxo Operacional Completo

### Etapa 1: Cadastro da Empresa

```
Usuário acessa /portal/empresas → Clica "Nova Empresa"
  │
  ├─ Preenche CNPJ (14 dígitos) + Tipo: 'cnpj'
  ├─ Ativa "Sincronizar com Receita" → sincronizar_receita = true
  │
  ▼ POST /api/companies
    ├─ normalizeDocumentoForTipo('cnpj', '12345678000199') → OK
    ├─ INSERT INTO companies (sync_status='pending')
    ├─ upsertCompanyByCNPJ() → BrasilAPI → mapBrasilAPIToCompany()
    ├─ UPDATE companies (dados da Receita, sync_status='ok', last_sync_at=now())
    └─ RETORNA company com todos os dados preenchidos

Banco de dados:
  companies: 1 novo registro (razao_social, endereço, CNAEs, etc.)
  company_history: nenhum evento neste momento
```

### Etapa 2: Vinculação de Alvará

```
Usuário acessa página da empresa → Aba "Alvarás" → "Vincular Alvará"
  │
  ├─ Seleciona tipo: "Alvará de Funcionamento" (frequencia='anual', prazo_inicio_dias=30)
  │
  ▼ POST /api/company-alvaras
    ├─ Verifica UNIQUE (company_id, alvara_id) → OK (primeiro vínculo)
    ├─ INSERT INTO company_alvaras (status='pendente')
    └─ logCompanyHistory(eventType='tarefa_vinculada')

Banco de dados:
  company_alvaras: 1 novo vínculo (status='pendente')
  company_history: 1 evento 'tarefa_vinculada'
```

### Etapa 3: Geração da Tarefa

```
Sistema (manual ou cron) → POST /api/alvara-tasks
  │
  ├─ Busca todos company_alvaras com is_active=true
  ├─ Verifica: vínculo 'Empresa X + Alvará de Funcionamento' sem tarefa pendente
  │
  ▼ Para o vínculo sem tarefa pendente:
    ├─ INSERT INTO alvara_tasks (status='pendente', due_date=null, title=null)
    │   → Trigger trg_alvara_task_created_hist dispara automaticamente:
    │     INSERT INTO alvara_task_history (event_type='created')
    ├─ Calcula inicio_obrigatorio_ate = hoje + 30 dias
    ├─ UPDATE alvara_tasks SET inicio_obrigatorio_ate = <data>
    └─ RETORNA {inseridos:1, ignoradosJaComPendente:0}

Banco de dados:
  alvara_tasks: 1 nova tarefa pendente
  alvara_task_history: 1 evento 'created'
  company_alvaras: data_vencimento = null (campo [LEGADO] sem uso no fluxo novo, mantido nulo)
```

### Etapa 4: Trabalho da Tarefa no Kanban

```
Usuário acessa /portal/acompanhamento (Kanban)
  │
  ├─ Card aparece na coluna "Pendente" com badge "⏳ Pendente - Não definida (restam 28 dias)"
  │
  ├─ Usuário arrasta para "Em Andamento"
  │   PATCH /api/alvara-tasks/[id]  {status: 'em_andamento'}
  │   ├─ Validação: pendente → em_andamento: OK
  │   ├─ UPDATE alvara_tasks SET status='em_andamento'
  │   └─ INSERT alvara_task_history {event_type:'status', de:'pendente', para:'em_andamento'}
  │
  ├─ Card move para "Em Andamento"
  │
  ├─ (Situação: Órgão exige vistoria → Usuário move para "Com Impedimento")
  │   PATCH {status:'com_impedimento', impediment_reason:'Aguardando vistoria da Vigilância Sanitária'}
  │   ├─ UPDATE alvara_tasks SET status='com_impedimento', impediment_reason=...
  │   └─ INSERT alvara_task_history {event_type:'status', de:'em_andamento', para:'com_impedimento'}
  │
  └─ Vistoria aprovada → Usuário retorna para "Em Andamento"
     PATCH {status: 'em_andamento'}
     └─ UPDATE + History
```

### Etapa 5: Upload do Documento e Conclusão

```
Usuário abre o card → Clica "Concluir Tarefa"
  │
  ├─ Formulário exige:
  │   ├─ Comentário/descrição ✓ (obrigatório)
  │   ├─ Data de emissão: 01/06/2026 ✓
  │   ├─ Data de vencimento: 31/05/2027 ✓ (anual)
  │   └─ Arquivo PDF: alvara_funcionamento.pdf ✓ (se anexo_obrigatorio=true)
  │
  ├─ Upload do arquivo:
  │   POST /api/alvara-tasks/[id]/attachment
  │   ├─ Gera presign URL do R2
  │   └─ PUT direto ao R2 (ou fallback multipart)
  │
  ▼ PATCH /api/alvara-tasks/[id]
    {status:'concluida', notes:'Alvará emitido com sucesso.', issue_date:'2026-06-01',
     expiration_date:'2027-05-31', file_path:'...', file_name:'alvara.pdf', ...}
  │
  ├─ Validações de backend (ver §8.3)
  │
  ▼ RPC complete_alvara_task() (TRANSAÇÃO ATÔMICA)
    ├─ UPDATE company_alvara_documents SET is_current=false (nenhum anterior neste caso)
    ├─ INSERT company_alvara_documents (issue_date='2026-06-01', expiration_date='2027-05-31',
    │   is_current=true, file_path='...', source_task_id=<task_id>)
    ├─ UPDATE alvara_tasks SET status='concluida', completed_at=now(), result_document_id=<doc_id>
    ├─ INSERT alvara_task_history (event_type='completed') [nova coluna from_status, to_status]
    ├─ INSERT company_alvara_document_history (event_type='document_created')
    │
    ├─ Cálculo da próxima tarefa:
    │   v_next_due = '2027-05-31'
    │   v_next_start_after = '2027-05-31' - 30 dias = '2027-05-01'
    │   (ajuste: se 2027-05-01 for sábado → 2027-05-03, se domingo → 2027-05-02)
    │
    └─ INSERT INTO alvara_tasks (status='pendente', due_date='2027-05-31', start_after='2027-05-01')
       → Trigger: INSERT INTO alvara_task_history (event_type='created')

Banco de dados após conclusão:
  company_alvara_documents: 1 documento vigente (is_current=true)
  alvara_tasks: tarefa atual=concluida, NOVA tarefa=pendente (vence 2027-05-31)
  alvara_task_history: 3 eventos (status, completed, created da nova)
  company_alvara_document_history: 1 evento document_created
```

### Etapa 6: Impacto no Dashboard após Conclusão

```
Dashboard (GET /api/stats) é recarregado:
  ├─ computeDocumentStatus(doc_2026) → 'vigente' (expiration='2027-05-31' > hoje)
  ├─ Empresa contabilizada em alvaras_emitidos++
  ├─ alvaras_vencidos-- (se era vencido antes)
  ├─ Conformidade recalculada
  ├─ Cobertura documental: file_path não nulo → documentCoverageRate aumenta
  ├─ Nova tarefa pendente (2027): aparece na contagem de pendentes
  └─ Throughput do mês: completedMonthTasks++
```

### Etapa 7: Renovação Futura (Ciclo Seguinte)

```
Em 2027-05-01 (start_after da nova tarefa):
  Tarefa aparece no Kanban com status "Pendente - Vence em 30 dias"
  └─ Fluxo repete a partir da Etapa 4
```

### Etapa 8: Arquivamento da Empresa (Encerramento)

```
Usuário arquiva empresa → PATCH /api/companies/[id] {archived_at: now()}
  ├─ UPDATE companies SET archived_at=now()
  ├─ INSERT company_history (event_type='arquivamento')
  │
  └─ Efeitos:
     ├─ Empresa some da listagem principal (filtro archived_at IS NULL)
     ├─ Empresa NÃO conta mais para KPIs do Dashboard
     ├─ Tarefas pendentes NÃO são canceladas automaticamente
     │   (mas a RPC de conclusão bloqueia novos documentos para vínculos arquivados)
     └─ Histórico e documentos permanecem acessíveis na listagem de arquivadas
```

---

## 20. Dependências entre Módulos

```
Módulo Empresas
    │
    ├──► Módulo de Tipos de Alvarás (catálogo)
    │       │
    │       └──► Vínculo empresa-alvará (company_alvaras)
    │                   │
    │                   ├──► Módulo de Tarefas (alvara_tasks)
    │                   │       │
    │                   │       ├──► Checklist (alvara_task_checklist_progress)
    │                   │       ├──► Histórico de Tarefa (alvara_task_history)
    │                   │       └──► Documentos (company_alvara_documents)
    │                   │                   │
    │                   │                   └──► Histórico Documental
    │                   │
    │                   └──► Histórico da Empresa (company_history)
    │
    ├──► Módulo de Acompanhamento (Kanban)
    │       └─ Lê: alvara_tasks + company_alvaras + companies + alvaras
    │       └─ Escreve: status, notes, protocolo via /api/alvara-tasks/[id]
    │
    ├──► Módulo de Dashboard
    │       └─ Lê: companies, company_alvaras, company_alvara_documents,
    │              alvara_tasks, profiles, alvaras, alvara_groups
    │       └─ Não escreve (somente leitura)
    │
    ├──► Módulo de Usuários e Permissões
    │       └─ profiles (display_name, role, portal_permissions, is_active)
    │       └─ responsible_user_id em companies
    │       └─ assigned_to em alvara_tasks
    │
    └──► Módulo de Sincronização (BrasilAPI)
            └─ Alimenta campos de companies (razão social, endereço, CNAEs)
            └─ Registra sync_logs
```

### 20.1 Cascatas de Exclusão (ON DELETE CASCADE) e Diretriz de Compliance
* **Regra Rígida de Produção:** **A exclusão física de registros em produção é expressamente proibida.** Para fins de compliance documental e trilha de auditoria contínua, as operações do dia a dia nunca devem apagar dados. 
* **Utilização de Soft-Deletes:** Qualquer encerramento ou descontinuação de entidades deve ocorrer estritamente pela aplicação de carimbos e marcadores de estado temporais:
  - Empresas $\rightarrow$ `companies.archived_at`
  - Vínculos $\rightarrow$ `company_alvaras.archived_at`
  - Documentos $\rightarrow$ `company_alvara_documents.archived_at`
  - Tarefas $\rightarrow$ `alvara_tasks.cancelled_at` / `cancelled_by`
  - Históricos $\rightarrow$ Nunca são arquivados ou removidos; permanecem imutáveis para fins de auditoria forense.
* **Comportamento em Homologação/Dev:** A exclusão física no banco de dados, configurada via constraints físicas (`ON DELETE CASCADE`), existe apenas para limpeza estrutural e sanitização de massas de dados errôneas em ambientes de teste. Nesses ambientes:
  - Excluir uma linha de `companies` $\rightarrow$ deleta fisicamente todos os `company_alvaras` associados $\rightarrow$ deleta fisicamente todas as `alvara_tasks` $\rightarrow$ limpa todo o `alvara_task_history` e `alvara_task_checklist_progress`.

### 20.2 Restrições de Exclusão Física (ON DELETE RESTRICT)
Como barreira de proteção de integridade referencial secundária na base de dados (mesmo em ambientes de homologação):
* A exclusão de um tipo de alvará (`alvaras`) é terminantemente **bloqueada** se existirem quaisquer vínculos (`company_alvaras`) criados para ele.
* A exclusão de um vínculo (`company_alvaras`) é **bloqueada** caso existam documentos emitidos (`company_alvara_documents`) apontando para ele.
* A exclusão de uma tarefa (`alvara_tasks`) é **bloqueada** caso possua históricos operacionais cadastrados ou se algum documento emitido a referenciar como origem.

---

## Apêndice A: Mapeamento de Endpoints da API

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/companies` | Lista empresas com filtros e paginação |
| POST | `/api/companies` | Cria empresa (com sync opcional) |
| GET | `/api/companies/[id]` | Detalhes de uma empresa |
| PATCH | `/api/companies/[id]` | Atualiza dados da empresa |
| DELETE | `/api/companies/[id]` | Arquiva empresa (soft-delete) |
| POST | `/api/companies/sync-all` | Sincroniza todas com BrasilAPI |
| POST | `/api/companies/sync-single` | Sincroniza empresa específica |
| GET | `/api/companies/export` | Exporta CSV/XLSX |
| POST | `/api/companies/import` | Importa CSV |
| GET | `/api/companies/filter-options` | Retorna UFs, cidades e situações disponíveis |
| POST | `/api/companies/responsible-batch` | Atualiza responsável em lote |
| GET | `/api/company-alvaras` | Lista vínculos (filtro por empresa ou tipo) |
| POST | `/api/company-alvaras` | Cria vínculo empresa-alvará |
| PATCH | `/api/company-alvaras/[id]` | Atualiza vínculo |
| DELETE | `/api/company-alvaras/[id]` | Remove vínculo |
| GET | `/api/alvara-tasks` | Lista tarefas com filtros de status/período |
| POST | `/api/alvara-tasks` | Garante tarefa pendente por vínculo ativo |
| GET | `/api/alvara-tasks/[id]` | Detalhes da tarefa + histórico |
| PATCH | `/api/alvara-tasks/[id]` | Atualiza status/notas/conclusão |
| POST | `/api/alvara-tasks/[id]/attachment` | Upload de arquivo/evidência |
| POST | `/api/alvara-tasks/[id]/checklist` | Atualiza progresso de etapa |
| POST | `/api/alvara-tasks/checklist-batch` | Atualiza múltiplas etapas |
| POST | `/api/alvara-tasks/admin/force-complete` | Encerramento Administrativo (exclusivo admin - **[EXCEÇÃO ADMINISTRATIVA]**) |
| GET | `/api/stats` | KPIs e dados do Dashboard |
| GET | `/api/alvaras` | Lista tipos de alvarás |
| POST | `/api/alvaras` | Cria tipo de alvará |
| PATCH | `/api/alvaras/[id]` | Atualiza tipo |
| GET | `/api/alvara-groups` | Lista grupos de alvarás |
| POST | `/api/alvara-groups` | Cria grupo |
| GET | `/api/users` | Lista usuários do portal |
| POST | `/api/users` | Cria usuário |
| PATCH | `/api/users/[id]` | Atualiza usuário |
| GET | `/api/sync-config` | Configuração de sincronização |
| PATCH | `/api/sync-config` | Atualiza configuração de sync |
| GET | `/api/sync-logs` | Histórico de sincronizações |
| POST | `/api/csp-report` | Endpoint de violações CSP |
| GET | `/api/company-alvara-documents/[id]` | Detalhes de documento |
| POST | `/api/documents` | Operações de documentos |
| GET | `/api/checklist-templates` | Lista templates de checklist do utilizador logado |
| POST | `/api/checklist-templates` | Cria novo template a partir de etapas ou snapshot |
| GET | `/api/checklist-templates/[id]` | Retorna o detalhe de um template com etapas |
| PATCH | `/api/checklist-templates/[id]` | Atualiza metadados e substitui a lista de etapas |
| DELETE | `/api/checklist-templates/[id]` | Exclui template e suas etapas associadas |
| GET | `/api/collaborators` | Lista colaboradores ativos cruzados com e-mails da Auth |

---

## Apêndice B: Chaves de localStorage

| Chave | Conteúdo | Módulo |
|---|---|---|
| `notifique-acompanhamento-lanes` | Posição dos cards nas colunas virtuais (legado v1) | Acompanhamento |
| `notifique-acompanhamento-collapsed-swimlanes` | Raias recolhidas/expandidas | Acompanhamento |
| `notifique-acompanhamento-swimlane` | Tipo de raia ativa (`empresa` ou `responsavel`) | Acompanhamento |

---

## Apêndice C: Funções SQL Críticas

### `complete_alvara_task(p_task_id, p_issue_date, p_expiration_date, p_is_indefinite, p_file_path, p_file_name, p_file_size, p_file_mime, p_notes, p_user_id)`
Procedure PL/pgSQL executada em transação atômica. Realiza:
1. Lock da tarefa via `SELECT FOR UPDATE`
2. Validação do vínculo (arquivado/suspenso)
3. Validação de parâmetros
4. Substituição do documento vigente
5. Inserção do novo documento
6. Conclusão da tarefa
7. Registros de histórico (tarefa + documental)
8. Criação da tarefa de renovação futura (se aplicável)

### `set_updated_at()`
Trigger function: atualiza `updated_at = now()` antes de qualquer `UPDATE`.

### `alvara_task_log_created()`
Trigger function: insere evento `created` no `alvara_task_history` após cada `INSERT` em `alvara_tasks`.

### `handle_new_user()`
Trigger function: cria linha em `public.profiles` após inserção em `auth.users`.

---

## Apêndice D: Dossiê do Alvará (Drawer de Detalhe por Vínculo)

### D.1 Objetivo
Painel lateral (slide-over) acessível a partir da listagem de alvarás de uma empresa. Exibe **tudo** sobre um vínculo específico: documentos, tarefas, linha do tempo e configurações.

### D.2 Fonte de Dados
`GET /api/company-alvaras/[id]/dossier` — retorna um objeto consolidado:
- `company_alvara` — dados do vínculo (número, observações, is_required, is_exempt, monitoring_status, archived_at)
- `alvara` — tipo de alvará (nome, frequência, prazo_inicio_dias, anexo_obrigatorio)
- `group` — grupo do alvará (nome, cor)
- `current_document` — documento com `is_current = true` (datas, arquivo)
- `documents[]` — todos os documentos do vínculo
- `tasks[]` — todas as tarefas (abertas, concluídas, canceladas)
- `timeline[]` — linha do tempo unificada (events de documentos + tarefas)
- `document_status` — `vigente` | `vencido` | `indeterminado` | `sem_documento`
- `task_status` — status textual da tarefa ativa ou `sem_tarefa_aberta`
- `permissions` — mapa de ações permitidas para o usuário atual

### D.3 Abas do Dossiê

| Aba | Conteúdo |
|---|---|
| **Resumo** | Badges de status, documento vigente (datas + download), card de próxima renovação, configurações do tipo, anotações |
| **Documentos** | Tabela de todos os documentos com filtros (somente vigente, mostrar arquivados) |
| **Tarefas** | Lista de tarefas com filtros (futuras, concluídas, canceladas) |
| **Linha do Tempo** | Timeline cronológica unificada de eventos (documentos + tarefas) com filtro por tipo |
| **Anotações / Configs** | Edição de observações; ações administrativas avançadas |

### D.4 Ações Administrativas (Aba Config)

Todas as ações abrem um diálogo de confirmação com campo de justificativa obrigatória e são irreversíveis sem ação explícita:

| Ação | Endpoint | Permissão | Justificativa |
|---|---|---|---|
| Suspender monitoramento | `POST /api/company-alvaras/[id]/suspend` | `canSuspendMonitoring` | Obrigatória |
| Reativar monitoramento | `POST /api/company-alvaras/[id]/suspend` | `canSuspendMonitoring` | Não requerida |
| Arquivar vínculo | `POST /api/company-alvaras/[id]/archive-link` | `canArchiveLink` | Obrigatória |
| Restaurar vínculo | `POST /api/company-alvaras/[id]/archive-link` | `canArchiveLink` | Não requerida |
| Arquivar documento | `POST /api/company-alvara-documents/[id]/archive` | `canArchiveDocuments` | Opcional |
| Restaurar documento | `POST /api/company-alvara-documents/[id]/archive` | `canArchiveDocuments` | Opcional |
| Encerramento Administrativo | `/api/alvara-tasks/[id]/force-complete` | `canForceCompleteTask` | Obrigatória (mín. 10 chars) - **[EXCEÇÃO ADMINISTRATIVA]** |

### D.5 Efeito do Encerramento Administrativo (Exceção Técnica - force-complete)

* **Conceito Oficial:** Trata-se de uma intervenção corretiva manual para fechar tarefas indevidas, duplicadas ou dispensadas por vias gerenciais. O termo oficial no portal é estritamente **"Encerramento Administrativo"** — **[EXCEÇÃO ADMINISTRATIVA]**.
* **Comportamento Técnico (Endpoint `/force-complete`):**
  - **Não Conclusão de Ciclo:** O endpoint técnico `/force-complete` apenas força a alteração do status da tarefa para `'cancelada'` (ou status equivalente closed de cancelamento).
  - **Inércia Regulamentar:** Esta operação **não** representa a conclusão do ciclo operacional regulamentar, **não** cria ou insere nenhum novo documento comprobatório de validade em `company_alvara_documents` e **não** gera ou agenda a próxima tarefa de renovação automática.
  - **Histórico Inviolável:** Registra permanentemente o evento sob o tipo `system` em `alvara_task_history` contendo a justificativa textual obrigatória, sem apagar nenhum documento ou log de histórico anterior.

### D.6 Suspensão de Monitoramento

**Efeito ao suspender (`monitoring_status = 'suspenso'`):**
- Tarefas existentes **permanecem intactas** — não são canceladas automaticamente
- A RPC `complete_alvara_task` **bloqueia conclusão** de tarefas vinculadas ao vínculo suspenso
- O vínculo **ainda aparece** na listagem de alvarás da empresa com badge "Suspenso"
- KPIs do Dashboard **excluem** vínculos suspensos de contagens de conformidade
- Registra evento `company_alvara_monitoring_suspended` em `company_history`

**Efeito ao reativar (`monitoring_status = 'ativo'`):**
- Conclusão de tarefas volta a ser permitida
- Registra evento `company_alvara_monitoring_reactivated` em `company_history`

### D.7 Filtros da Aba Documentos

| Filtro | Estado Padrão | Efeito |
|---|---|---|
| Apenas Vigente | Desativado | Exibe somente `is_current = true` |
| Mostrar Arquivados | Desativado | Inclui documentos com `archived_at != null` |

### D.8 Filtros da Aba Tarefas

| Filtro | Estado Padrão | Efeito |
|---|---|---|
| Futuras (start_after > hoje) | Ocultas | Mostra tarefas pendentes com `start_after > hoje` |
| Concluídas | Exibidas | Oculta/mostra tarefas com `status = 'concluida'` |
| Canceladas | Ocultas | Mostra tarefas com `status = 'cancelada'` |

### D.9 Filtros da Linha do Tempo

| Opção | Exibe |
|---|---|
| Todos | Todos os eventos (padrão) |
| document | Apenas eventos de documento |
| task | Apenas eventos de tarefa |
| error | Apenas erros operacionais |

### D.10 Leitura Segura de Erros de Ciclo de Vida (`lifecycle_errors`)

* **Isolamento e Segurança de Baixo Nível:** A tabela `lifecycle_errors` possui políticas RLS que impedem de forma absoluta qualquer leitura ou escrita direta por parte dos navegadores clientes (mecanismo `USING (false)` ativo no banco de dados).
* **Consumo do Client:** O frontend do portal nunca lê esta tabela diretamente.
* **Exposição de Timeline:** O backend atua como gateway de segurança, utilizando chaves com privilégio elevado (`service_role`) para consultar e processar os erros de ciclo, exibindo apenas um resumo estritamente sanitizado e livre de dados sensíveis na timeline do Dossiê, acessível exclusivamente para administradores.

---

## Apêndice E: Página de Geração e Manutenção de Tarefas

**Rota:** `/portal/acompanhamento/geracao`  
**Acesso:** Link a partir da página de Acompanhamento

### E.1 Objetivo
Página administrativa para geração em lote e manutenção de tarefas pendentes. Permite:
1. Gerar tarefas em falta (um clique)
2. Eliminar tarefas selecionadas que estejam intactas (sem histórico além da criação)
3. Exclusão avançada por período de vencimento (requer senha)

### E.2 Geração de Tarefas

`POST /api/alvara-tasks` com body `{}` (sem filtros específicos):
- Percorre todos os vínculos com `alvaras.is_active = true` e sem `archived_at`
- Para cada vínculo **sem tarefa pendente ativa**, insere uma nova tarefa `pendente` sem `due_date`
- Retorna `{ inseridos: N, ignoradosJaComPendente: M }`
- Idempotente: executar múltiplas vezes não duplica tarefas (protegido por índice único)

### E.3 Eliminação de Tarefas Intactas (em lote)

`POST /api/alvara-tasks/admin/delete-pending-clean` com `{ taskIds: string[] }`:
- Apaga **somente** as tarefas selecionadas que:
  1. Estejam com `status = 'pendente'`
  2. Não tenham eventos de histórico além do `created` inicial (ou sem histórico — legado)
- Tarefas que não atendam aos critérios são ignoradas silenciosamente
- Retorna `{ deleted: N, skipped: M, message?: string }`

### E.4 Exclusão por Período (Operação Destrutiva de Exceção)
`POST /api/alvara-tasks/admin/delete-by-period` com `{ from, to, password }`:

> [!CAUTION]
> **Operação Excepcional, Perigosa e Não-Operacional:**
> - **Bloqueio de Produção:** Esta operação **deve ser estritamente bloqueada em ambiente de produção** por verificação de variável de ambiente (ex: `NODE_ENV === 'production'`).
> - **Restrição de Ambiente:** Permitida exclusivamente em ambientes de homologação, staging ou desenvolvimento para fins de sanitização estrutural e correção de cargas de teste em lote.
> - **Protocolo de Execução:** Em caso de necessidade em outros ambientes de suporte e homologação avançada, a execução exige:
>   1. Perfil autenticado com privilégios de **`role = 'admin'`**.
>   2. Confirmação explícita digitando a senha administrativa do usuário autenticado (`password`).
>   3. Validação textual de confirmação na interface para evitar cliques acidentais.
>   4. Registro obrigatório com severidade alta em `audit_logs` e stdout.
>   5. Execução de backup físico anterior da base de dados.
> - **Efeito Destrutivo:** Remove **todas** as tarefas do período selecionado de forma física e irreversível (eliminando cascata de históricos operacionais, check-lists e arquivos associados).

### E.5 Lista de Tarefas Pendentes (Visão)

- Carrega `GET /api/alvara-tasks?status=pendente&from=<ano-1>-01-01&to=<ano+3>-12-31`
- Exibe tarefas pendentes com `due_date` no intervalo de -1 a +3 anos do ano atual, mais as sem `due_date`
- Pesquisa local por empresa, alvará, código, CNPJ, notas

---

## Apêndice F: Sistema de Filtros Avançados do Acompanhamento

### F.1 Filtros Visuais Principais

| Filtro | Tipo | Persistência |
|---|---|---|
| Período (anos) | Multi-seleção + "Ocultos" | Memória (React state) |
| Empresas | Multi-seleção com busca | Memória |
| Tipos de Alvará | Multi-seleção com busca | Memória |

### F.2 Filtros Avançados (Condições Lógicas)

Permite construir condições compostas com operador lógico `E` (AND) ou `OU` (OR):

| Campo | Operadores disponíveis |
|---|---|
| `cidade` | equals, contains, starts_with, ends_with |
| `uf` | equals, contains, starts_with, ends_with |
| `codigo_empresa` | equals, contains, starts_with, ends_with |
| `nome_empresa` | equals, contains, starts_with, ends_with |
| `nome_alvara` | equals, contains, starts_with, ends_with |
| `frequencia` | equals, contains, starts_with, ends_with |
| `protocolo` | equals, contains, starts_with, ends_with |
| `atraso` | equals (valores: `sim` / `não`) |
| `etapa` | equals, contains, starts_with, ends_with (ex: `pendente`, `em andamento`) |
| `status` | equals, contains (texto do badge de status dinâmico) |

### F.3 Regras de Visibilidade Aplicadas em Memória
Para otimização da carga de cards e foco operacional, o Kanban aplica uma **ordem estrita de precedência em três camadas** para ocultação automática de tarefas em memória, antes de qualquer filtro de busca ou lógicos do operador:

1. **Camada 1 (Filtros de Estado Terminal):** 
   - Oculta tarefas nos status `concluida` ou `cancelada` conforme filtros ativos na interface (por padrão, concluídas recentes são exibidas e canceladas são ocultas).
2. **Camada 2 (Regra de `start_after` - Tarefas Futuras):** 
   - Oculta de imediato qualquer tarefa cuja data permitida de início seja posterior à data de hoje (`start_after > hoje`).
   - *Exceção de Exibição:* O utilizador deve marcar ativamente o toggle **"Mostrar tarefas futuras"** na barra de ferramentas do portal para forçar a visualização.
3. **Camada 3 (Regra dos 90 dias - Vencimento Longo):** 
   - Oculta tarefas pendentes cuja data de vencimento seja superior a 90 dias a partir de hoje (`due_date > hoje + 90 dias`).
   - *Exceção de Exibição:* O utilizador deve selecionar a opção **"Ocultos (> 90 dias)"** na multi-seleção de períodos de vencimento.

> [!NOTE]
> **Precedência Cascata:** Se uma tarefa acumular múltiplos critérios de ocultação (ex: vencimento superior a 90 dias e com `start_after` futuro), ela só aparecerá em tela quando **todas** as respectivas chaves de exceção estiverem devidamente ativadas nos filtros.

### F.4 Ordenação por Coluna

| Coluna Kanban | Critério de Ordenação |
|---|---|
| Pendente | `due_date` crescente (vencimentos mais próximos primeiro) |
| Em Andamento | `due_date` crescente |
| Com Impedimento | `due_date` crescente |
| Concluído | `completed_at` decrescente (mais recentes primeiro) |
| Canceladas | `completed_at` decrescente |

---

## Apêndice G: Atualização Automática e Reconexão do Kanban

### G.1 Polling Automático em Background

O Kanban recarrega os dados automaticamente a cada **30 segundos** usando `setInterval`:
```typescript
const intervalMs = 30_000; // 30 segundos
const id = window.setInterval(() => void load({ silent: true }), intervalMs);
```

**Condições de pausa:** O polling é **suspenso** enquanto o modal de detalhe da tarefa (`TaskEditModal`) estiver aberto (`detailModal != null`). Isso evita sobrescrever dados em edição.

### G.2 Recarga ao Voltar ao Foco (Visibility API)

Quando o usuário retorna ao aba/janela do browser (`visibilityState === 'visible'`), os dados são recarregados silenciosamente:
```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void load({ silent: true });
});
```

**Condição de pausa:** Também suspenso quando o modal de detalhe está aberto.

### G.3 Recarga Silenciosa vs. Carregamento com Spinner

- **`load({ silent: true })`** — não exibe spinner, recarrega em background. Usado em polling e após operações de drag-and-drop.
- **`load()`** (sem opções) — exibe spinner de loading. Usado na carga inicial e em ações do usuário que precisam de feedback visual.

---

## Apêndice H: Drag-and-Drop no Kanban

### H.1 Implementação
- Utiliza a API nativa do HTML5 (`draggable`, `onDragStart`, `onDragOver`, `onDrop`)
- O `taskId` é transferido via `e.dataTransfer.setData('text/plain', taskId)`
- O card arrastado é identificado pelo estado `dragTaskId`

### H.2 Comportamento por Coluna de Destino
O drag-and-drop é restrito exclusivamente a tarefas em status operacionais ativos (`pendente`, `em_andamento`, `com_impedimento`). 

| Destino | Comportamento do Drag-and-Drop |
|---|---|
| `pendente` | `PATCH status = 'pendente'` (recua a tarefa de volta para pendente) |
| `andamento` | `PATCH status = 'em_andamento'` |
| `impedimento` | Prompt na interface solicita motivo $\rightarrow$ `PATCH status = 'com_impedimento', impediment_reason = <motivo>` |
| `concluido` | Abre o `TaskEditModal` — o drag para concluído **não conclui diretamente**, exige preenchimento do formulário |
| `cancelada` | Prompt na interface solicita motivo $\rightarrow$ `PATCH status = 'cancelada', cancellation_reason = <motivo>` |

> [!WARNING]
> **Imutabilidade de Estados Terminais:** Tarefas com status `concluida` ou `cancelada` são consideradas **terminais e imutáveis** — **[REGRA CORRIGIDA]**. Qualquer tentativa de arrastar um card nestes status para outra coluna é **bloqueada de imediato** em tela e retorna status HTTP 400 no backend. Não é permitido reabrir tarefas concluídas ou canceladas via drag-and-drop.
> 
> **Reabertura Administrativa Excepcional ([EXCEÇÃO ADMINISTRATIVA]):**
> A reabertura administrativa de tarefas em estados concluídos ou cancelados é estritamente excepcional, restrita a usuários com perfil de administrador (`role = 'admin'`). Ela exige obrigatoriamente uma justificativa textual registrada de forma definitiva nos logs de auditoria, preserva integralmente o documento emitido e o histórico de andamento originais intactos, e deve ser tratada como última alternativa operacional. Recomenda-se e **prefere-se a substituição pela criação de uma nova tarefa corretiva** independente em vez de reabrir tarefas finalizadas.

### H.3 Drag em Colunas com Swimlanes

O drag-and-drop funciona normalmente mesmo quando o Kanban está organizado em raias (por empresa ou responsável). O card pode ser arrastado de qualquer raia para qualquer coluna.

---

## Apêndice I: Modal de Edição de Tarefa (`TaskEditModal`)

### I.1 Estrutura do Modal

O modal é carregado dinamicamente (lazy import com `next/dynamic`, sem SSR) para otimizar o bundle inicial.

**Dados carregados ao abrir (`GET /api/alvara-tasks/[id]`):**
- `task` — dados completos da tarefa incluindo joins com `company_alvaras → companies`, `alvaras → alvara_groups`, `company_alvara_documents[]`
- `history` — lista de `AlvaraTaskHistory` ordenada cronologicamente

**Checklist carregada via:**
```
POST /api/alvara-tasks/checklist-batch { task_ids: [taskId] }
```

### I.2 Campos Editáveis no Modal

| Campo | Condição de Edição | Endpoint |
|---|---|---|
| Data de emissão | Tarefa aberta (pendente/em_andamento/com_impedimento) | `PATCH /api/company-alvaras/[id]` |
| Data de vencimento | Tarefa aberta + não indefinida | `PATCH /api/company-alvaras/[id]` |
| Validade Indeterminada | Tarefa aberta | `PATCH /api/company-alvaras/[id]` |
| Comentário/notas | Tarefa aberta | `PATCH /api/alvara-tasks/[id]` |
| Protocolo | Tarefa aberta | `PATCH /api/alvara-tasks/[id]` |
| Anexo do documento | Tarefa aberta | Upload → `PATCH /api/alvara-tasks/[id]` |
| Evidências (intermediárias) | Tarefa aberta | Upload → `PATCH /api/alvara-tasks/[id]` |
| Etapas da checklist | Tarefa aberta | `PATCH /api/alvara-tasks/[id]/checklist` |
| Periodicidade override | Tarefa aberta + modo edição ativo | `PATCH /api/company-alvaras/[id]` |

### I.3 Persistência de Rascunho de Anexo

O arquivo preparado para upload (antes de concluir a tarefa) é **salvo em `localStorage`**:
- Chave: `"draftAttachment_<taskId>"`
- Restaurado quando o modal é reaberto para a mesma tarefa
- Apagado após a conclusão bem-sucedida

### I.4 Regras de Habilitação do Botão "Concluir"

O botão "Concluir" fica habilitado (`podeConcluirModal = true`) somente quando **todas** as condições são satisfeitas:

1. `hasEmissao` — Data de emissão preenchida e válida (dd/mm/aaaa)
2. `isIndefiniteDraft || hasVencimento` — Data de vencimento preenchida OU validade indeterminada marcada
3. `okAnexo` — Se `anexo_obrigatorio = true`: documento anexado (existente ou recém-preparado)
4. `okChecklist` — Se `checklist_obrigatorio = true`: todas as etapas marcadas como `completed`

O tooltip do botão desabilitado lista exatamente quais requisitos faltam.

### I.5 Ação de "Salvar dados do documento" vs. "Concluir"

São duas operações **distintas e independentes**:

| Ação | O que faz | Gera nova tarefa? |
|---|---|---|
| **Salvar dados** | Atualiza datas no `company_alvaras` (legado) | Não |
| **Concluir** | Executa RPC transacional, cria documento, fecha ciclo | Sim (se aplicável) |

A nota exibida abaixo do botão "Salvar" esclarece: *"Esta ação salva as datas, mas não conclui a tarefa."*

### I.6 Override de Periodicidade por Vínculo

Dentro do modal, há um modo de edição de periodicidade por vínculo individual:
- Permite sobrescrever a frequência padrão do tipo (`alvaras.frequencia`) com outra específica para aquele vínculo (`company_alvaras.frequencia_override`)
- Se `frequencia_override = 'personalizada'`: campo extra `dias_frequencia_personalizada` (int > 0)
- Permite "Regerar Datas": `POST /api/company-alvaras/[id]/regerar` — recalcula `due_date` e `start_after` da tarefa ativa usando as regras de periodicidade atuais

---

## Apêndice J: Configurações do Portal

### J.1 Módulo de Usuários (`/portal/configuracoes/usuarios`)

**Ações disponíveis (somente admin):**
- Criar novo usuário (`POST /api/users`)
- Editar nome e função (`PATCH /api/users/[id]`)
- Ativar/desativar usuário (`is_active`) — quando inativo, o Supabase Auth bane o usuário até `2099-12-31`
- Configurar permissões por tela (`portal_permissions`)
- Listar todos os usuários com data de último login

**Campos de `portal_permissions` (mapa de chaves e telas granulares do portal):**

O sistema suporta níveis de acesso `"read"` (leitura) ou `"edit"` (escrita) para cada uma das chaves configuráveis abaixo. Os administradores do portal ignoram essas regras (acesso total irrestrito).

| Chave de Permissão | Tela / Rota Correspondente | Nível / Restrições |
|---|---|---|
| `dashboard` | `/portal/dashboard` | Visualização de KPIs e gráficos |
| `acompanhamento` | `/portal/acompanhamento` | Visualização e operação do painel Kanban |
| `empresas` | `/portal/empresas` | Listagem e detalhes cadastrais de empresas |
| `alvaras` | `/portal/alvaras` | Catálogo de tipos de alvarás cadastrados |
| `config_usuarios` | `/portal/configuracoes/usuarios` | Gestão de perfis e permissões (**Admin Only**) |
| `geracao_manutencao`| `/portal/acompanhamento/geracao` | Geração em lote e limpeza de tarefas pendentes |
| `empresas_importar` | `/portal/empresas/importar` | Importação em lote de empresas via arquivo CSV |
| `empresas_responsaveis`| `/portal/empresas/responsaveis`| Atribuição em massa de responsáveis de contas |
| `alvaras_importar` | `/portal/alvaras/importar` | Importação em lote de tipos de alvará via CSV |
| `alvaras_etapas` | `/portal/alvaras/etapas` | Criação e edição de checklists e templates |
| `alvaras_grupos` | `/portal/alvaras/grupos` | Criação e gerenciamento de grupos de alvará |
| `config_sync` | `/portal/configuracoes/sincronizacao` | Configurações do cron e logs de sync da BrasilAPI |

### J.2 Módulo de Sincronização (`/portal/configuracoes/sincronizacao`)

Configuração de sincronização automática com a Receita Federal (BrasilAPI):

| Campo | Tipo | Descrição |
|---|---|---|
| `sync_enabled` | boolean | Liga/desliga o agendamento automático |
| `sync_time` | time | Horário de execução do cron (ex: `03:00`) |
| `date_start` | date | Filtro: somente empresas abertas após esta data |
| `date_end` | date | Filtro: somente empresas abertas antes desta data |
| `only_active` | boolean | Filtro: somente situação cadastral `ATIVA` |

**Visualização de logs:** Tabela de `sync_logs` com histórico de execuções (total, sucesso, erros, duração, disparador).

### J.3 Módulo de Periodicidade (`/portal/configuracoes/periodicidade`)

Visualização e referência das periodicidades disponíveis no catálogo de alvarás. Não permite alteração direta das frequências globais — apenas informativo.

---

## Apêndice K: Regras de Negócio de Datas (Resumo Executivo)

```
REGRA GERAL DE DATAS NO SISTEMA:

1. PRIMEIRO CICLO (sem emissão prévia):
   início_obrigatorio_ate = created_at + prazo_inicio_dias
   due_date = null (preenchido manualmente via modal ou via conclusão)

2. AO CONCLUIR UMA TAREFA (emissão de novo documento):
   novo_documento.expiration_date = fornecida pelo usuário
   nova_tarefa.due_date = novo_documento.expiration_date
   nova_tarefa.start_after = nova_tarefa.due_date - prazo_inicio_dias
   (com ajuste de fim de semana conforme weekend_adjust)

3. STATUS DINÂMICO DE UMA TAREFA:
   limitDate = due_date ?? inicio_obrigatorio_ate ?? (created_at + prazo_inicio_dias)
   
   SE limitDate < hoje → VENCIDA (vários sub-estados por status e coluna)
   SE limitDate <= hoje + 90 → VENCE EM X DIAS
   SE limitDate > hoje + 90 → VÁLIDO (ou oculto no Kanban)

4. AJUSTE DE FIM DE SEMANA (weekend_adjust):
   'none'       → sem ajuste
   'postpone'   → sábado → +2 (segunda), domingo → +1 (segunda)
   'anticipate' → sábado → -1 (sexta), domingo  → -2 (sexta)

5. VALIDADE INDETERMINADA (is_indefinite = true):
   → Não gera nova tarefa de renovação
   → document_status = 'indeterminado' (não vencido)
   → expiration_date = null

6. FREQUÊNCIA PERSONALIZADA (frequencia = 'personalizada'):
   → Não gera nova tarefa automática
   → Próxima renovação deve ser planejada manualmente
```

---

## Apêndice L: Tabela de Referência Rápida — Estados do Sistema

### L.1 Estados de `monitoring_status` (company_alvaras)

| Valor | Exibição | Pode Concluir Tarefa? | Aparece no Dashboard? |
|---|---|---|---|
| `ativo` | Ativo | ✅ Sim | ✅ Sim |
| `suspenso` | Suspenso | ❌ Não (bloqueado pela RPC) | ✅ Sim (com badge) |
| `dispensado` | Dispensado | ✅ Sim (se tarefa existir) | ✅ Sim |

### L.2 Estados de `document_status` (computado)

| Valor | Condição | Conta como "Emitido"? |
|---|---|---|
| `vigente` | `is_current = true` E `expiration_date >= hoje` | ✅ Sim |
| `indeterminado` | `is_current = true` E `is_indefinite = true` | ✅ Sim |
| `vencido` | `is_current = true` E `expiration_date < hoje` | ❌ Não |
| `sem_documento` | Nenhum documento `is_current = true` | ❌ Não |

### L.3 Estados de `sync_status` (companies)

| Valor | Condição |
|---|---|
| `pending` | Cadastro recém criado, aguardando primeira sincronização |
| `ok` | Última sincronização com BrasilAPI bem-sucedida |
| `error` | Erro na última tentativa de sincronização (não 404) |
| `not_found` | CNPJ não encontrado na Receita Federal (HTTP 404) |
| `manual` | Empresa criada manualmente sem consulta à BrasilAPI |

### L.4 Prioridades de Tarefas

| Valor | Uso Recomendado |
|---|---|
| `baixa` | Alvará secundário, longo prazo |
| `media` | Padrão para todos os vínculos |
| `alta` | Próximo vencimento, atenção especial |
| `critica` | Vencido, impedimento grave, risco legal imediato |

---

## Apêndice M: Interceptação Dinâmica de Requisições de API (RBAC)

### M.1 Objetivo
Garantir a integridade do controle de acesso impedindo que utilizadores com nível de acesso apenas de leitura (`"read"`) ou sem acesso a uma determinada área realizem modificações ou mutações (operações de POST, PATCH, PUT ou DELETE) nas APIs do portal.

### M.2 Funcionamento da Interceptação
Toda requisição de mutação executada nos endpoints de API passa por uma validação centralizada de nível de acesso em memória (implementada em `src/lib/api-mutation-portal-screen.ts`):

1. **Extração do Endpoint:** O caminho (`pathname`) da requisição HTTP é isolado e normalizado (removendo parâmetros de query).
2. **Resolução de Chave de Tela (`screenKey`):**
   O endpoint é associado à respectiva chave de tela configurada no perfil do usuário:
   - `/api/companies/import` $\rightarrow$ `'empresas_importar'`
   - `/api/companies/export` $\rightarrow$ `'empresas'`
   - `/api/companies/responsible-batch` $\rightarrow$ `'empresas_responsaveis'`
   - `/api/companies/sync-all` $\rightarrow$ `'config_sync'`
   - `/api/companies` $\rightarrow$ `'empresas'`
   - `/api/company-alvaras` $\rightarrow$ `'acompanhamento'`
   - `/api/alvara-tasks` $\rightarrow$ `'acompanhamento'`
   - `/api/alvara-groups` $\rightarrow$ `'alvaras_grupos'`
   - `/api/alvara-tasks/admin` $\rightarrow$ `'geracao_manutencao'`
   - `/api/alvaras/import` $\rightarrow$ `'alvaras_importar'`
   - `/api/alvaras` $\rightarrow$ `'alvaras'`
   - `/api/sync-config` ou `/api/sync-logs` $\rightarrow$ `'config_sync'`

3. **Validação do Nível de Permissão:**
   - Se o endpoint estiver mapeado para uma tela, o sistema verifica a permissão atribuída ao usuário em `portal_permissions`.
   - O nível de acesso exigido para qualquer operação de escrita (POST/PATCH/DELETE) é estritamente **`"edit"`**.
   - Se o usuário possuir nível apenas de leitura (`"read"`) ou se a tela não estiver concedida, a requisição é abortada de imediato no backend, retornando status **`HTTP 403 Forbidden`** com a resposta padrão:
     ```json
     { "error": "Acesso negado. Apenas leitura nesta área." }
     ```
   - **Isenção Administrativa:** Contas com a role administrativa (`role = 'admin'`) ignoram todas as restrições baseadas em chaves e possuem permissão de mutação global irrestrita.

---

## Apêndice N: Parser e Importador Inteligente de CSV

### N.1 Objetivo
Permitir a carga massiva de empresas e tipos de alvarás de forma flexível e permissiva, tolerando variações de delimitadores, ordenações de colunas e normalizações de termos coloquiais comumente gerados pelo Microsoft Excel ou extraídos de sistemas legados.

### N.2 Algoritmo de Auto-Detecção de Delimitadores (`src/lib/csv-import.ts`)
Planilhas geradas em sistemas locais frequentemente utilizam o ponto e vírgula (`;`) ou tabulações (`\t`) como separadores padrão. O importador resolve isso dinamicamente:

1. **Higienização Inicial:** O importador remove o Byte Order Mark (BOM) gerado pelo Excel (`\uFEFF`) e padroniza quebras de linha (`\r\n` $\rightarrow$ `\n`).
2. **Normalização de Cabeçalhos:** Todos os cabeçalhos das colunas do CSV sofrem `trim()`, remoção de BOM residual e conversão para minúsculas (`toLowerCase`).
3. **Múltiplas Tentativas de Parsing (PapaParse):**
   - O sistema realiza 4 tentativas de leitura sequenciais em memória utilizando delimitadores distintos:
     1. Configuração de detecção automática nativa
     2. Delimitador ponto e vírgula (`;`)
     3. Delimitador vírgula (`,`)
     4. Delimitador tabulação (`\t`)
4. **Escolha por Pontuação de Amostra (Score):**
   - Para cada tentativa de parsing, o sistema executa uma avaliação da massa de dados obtida:
     - **Importação de Empresas:** Conta quantos registros lidos contêm CNPJs válidos de 14 dígitos (extraídos por `cleanCNPJ`).
     - **Importação de Alvarás:** Conta quantos registros lidos possuem o campo de nome populado.
   - **Pontuação Ajustada:** $Score = (ItensValidos \times 1000) - QuantidadeErrosMismatchColunas$.
   - O parser com maior pontuação ajustada é selecionado para carregar o lote de dados de forma definitiva, eliminando erros comuns de formatação.

### N.3 Parser Flexível de Atributos de Alvarás (`src/lib/alvara-import.ts`)
Durante o processamento das colunas do CSV de tipos de alvarás, os valores são flexibilizados e mapeados para os tipos de dados do banco de dados PostgreSQL:

1. **Resolução de Frequência (`parseFrequenciaCell`):**
   - Aceita tanto o slug físico (`diaria`, `mensal`, `anual`, etc.) quanto o nome legível em português, com ou sem acentuação (ex: `"Mensal"`, `"Decendial"`, `"Anual"`, `"Bimestral"`).
   - O parser remove acentuações (`normalize("NFD")`) e faz correspondência tolerante ao case.
2. **Ajuste de Fim de Semana (`parseWeekendCell`):**
   - Normaliza termos e traduções livres em português para os slugs aceitos:
     - `"nenhum"`, `"sem ajuste"` $\rightarrow$ `'none'`
     - Qualquer termo contendo as raízes `"posterg"` ou `"postpone"` $\rightarrow$ `'postpone'`
     - Qualquer termo contendo as raízes `"antecip"` ou `"anticipate"` $\rightarrow$ `'anticipate'`
3. **Status Ativo (`parseAtivoCell`):**
   - Avalia a intenção lógica da célula. Células contendo `0`, `n`, `nao`, `não`, `false`, `off` ou `inativo` definem o tipo como inativo (`is_active = false`). Células vazias ou contendo qualquer outro valor são interpretadas como `true` (ativo).
4. **Vínculo Inteligente com Grupos (`resolveGroupIdByExactName`):**
   - O importador cruza o texto do grupo informado no arquivo com os nomes dos grupos existentes na tabela `alvara_groups`.
   - Se houver match exato (ignoring trailing spaces), o `group_id` é preenchido.
   - Se for vazio ou contiver termos de escape como `"sem grupo"`, `"-"`, `"nenhum"`, o `group_id` é salvo como nulo (`null`), evitando rejeições por integridade referencial.

---

## Apêndice O: Diretrizes de Teste e Validação por Simulação do Usuário

### O.1 Diretriz de Ação Direta
Para garantir que as regras de negócio, layouts e transições de tela estejam em perfeita sintonia e de acordo com a experiência do usuário final, a validação de novos fluxos e correções deve sempre que possível ser realizada por meio de interações diretas com a interface do portal (site).

### O.2 Execução de Testes
1. **Emulação do Usuário:** Realizar fluxos completos de cliques, preenchimento de inputs, submissão de formulários, drag-and-drop no quadro Kanban e manipulação de modais diretamente na interface visual.
2. **Clareza de Regras:** Esta abordagem ajuda a constatar visualmente se as regras estão de acordo, se os feedbacks visuais (como loadings, toasts e skeletons) estão responsivos e se o comportamento dinâmico atende às expectativas de usabilidade real do usuário no sistema.
3. **Registro de Evidências:** Registrar os passos executados, os logs observados na console do navegador e as capturas visuais da interface para documentar o sucesso do comportamento simulado.


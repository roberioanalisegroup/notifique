# Plano de Ação — Refatoração Robusta da Gestão de Alvarás

## Objetivo

Reestruturar o sistema para separar definitivamente:

- **Vínculo da empresa com o alvará**
- **Documento emitido**
- **Tarefa operacional**
- **Histórico e auditoria**
- **Indicadores analíticos**

A mudança tem como objetivo deixar o sistema mais correto conceitualmente, mais auditável, mais seguro e pronto para escalar.

---

## 1. Problema atual

Hoje o sistema mistura responsabilidades entre `company_alvaras` e `alvara_tasks`.

A tabela `company_alvaras` acaba representando ao mesmo tempo:

- vínculo da empresa com o tipo de alvará;
- situação documental;
- datas do documento atual;
- estado do ciclo de renovação;
- parte da lógica operacional.

Além disso, parte do estado operacional do Kanban fica em `localStorage`, especialmente as raias virtuais de:

- `pendente`;
- `em andamento`;
- `com impedimento`.

Isso funciona para um MVP, mas é frágil para um sistema multiusuário e auditável.

### Principal problema conceitual

Quando uma tarefa é concluída, o sistema atual reseta o vínculo principal:

```txt
company_alvaras.data_emissao = null
company_alvaras.data_vencimento = null
company_alvaras.status = "pendente"
```

Isso é conceitualmente incorreto.

O alvará recém-emitido continua existindo e deve permanecer vigente. O que deve nascer é uma nova tarefa futura de renovação.

O correto seria:

```txt
Documento atual = vigente
Próxima tarefa = pendente no futuro
```

---

## 2. Nova visão conceitual

O sistema deve separar quatro conceitos principais.

### 2.1 Vínculo do alvará

Representa que uma empresa precisa monitorar determinado tipo de alvará.

Exemplo:

```txt
Empresa X precisa monitorar o Alvará de Funcionamento
```

### 2.2 Documento emitido

Representa uma emissão real do alvará, com:

- data de emissão;
- data de vencimento;
- arquivo PDF;
- validade indeterminada, se aplicável;
- histórico de substituição.

### 2.3 Tarefa operacional

Representa o trabalho necessário para obter, renovar, regularizar, cancelar ou dispensar um alvará.

### 2.4 Auditoria

Representa o histórico das ações realizadas:

- quem alterou;
- quando alterou;
- de qual status;
- para qual status;
- qual justificativa;
- qual documento foi gerado;
- qual erro ocorreu.

---

## 3. Modelo de dados recomendado

## 3.1 `company_alvaras`

Essa tabela deve representar apenas o vínculo entre empresa e tipo de alvará.

Ela responde:

> Essa empresa precisa monitorar esse alvará?

### Campos recomendados

```sql
company_alvaras
---------------
id uuid primary key
company_id uuid not null
alvara_id uuid not null
is_required boolean default true
is_exempt boolean default false
exemption_reason text
monitoring_status text not null default 'ativo'
archived_at timestamp with time zone
created_at timestamp with time zone default now()
updated_at timestamp with time zone default now()
created_by uuid
updated_by uuid
```

### Status de monitoramento sugeridos

```txt
ativo
dispensado
arquivado
suspenso
```

Importante: esse campo não deve dizer se o documento está vencido ou vigente. Essa situação deve ser calculada a partir do documento atual.

---

## 3.2 `company_alvara_documents`

Essa é a principal nova tabela.

Ela representa cada documento real emitido para um vínculo `company_alvaras`.

### Campos recomendados

```sql
company_alvara_documents
------------------------
id uuid primary key
company_alvara_id uuid not null references company_alvaras(id)
issue_date date
expiration_date date
is_indefinite boolean default false
file_path text
file_name text
file_size bigint
file_mime_type text
is_current boolean default false
source_task_id uuid
notes text
created_at timestamp with time zone default now()
created_by uuid
replaced_at timestamp with time zone
replaced_by uuid
```

### Exemplo

| Documento | Emissão | Vencimento | Atual |
|---|---:|---:|---:|
| Alvará 2024 | 10/01/2024 | 10/01/2025 | Não |
| Alvará 2025 | 08/01/2025 | 08/01/2026 | Sim |

Com esse modelo, o sistema nunca mais precisa resetar `company_alvaras`.

---

## 3.3 `alvara_tasks`

Essa tabela deve representar o trabalho operacional.

### Campos recomendados

```sql
alvara_tasks
------------
id uuid primary key
company_alvara_id uuid not null references company_alvaras(id)
task_type text not null
status text not null
priority text
due_date date
start_after date
assigned_to uuid
opened_from_document_id uuid references company_alvara_documents(id)
result_document_id uuid references company_alvara_documents(id)
completed_at timestamp with time zone
completed_by uuid
cancelled_at timestamp with time zone
cancelled_by uuid
cancellation_reason text
impediment_reason text
created_at timestamp with time zone default now()
created_by uuid
updated_at timestamp with time zone default now()
updated_by uuid
```

### Tipos de tarefa sugeridos

```txt
primeira_emissao
renovacao
regularizacao
revisao
cancelamento
dispensa
```

### Status físicos sugeridos

```txt
pendente
em_andamento
com_impedimento
concluida
cancelada
```

### Regra importante

Não salvar `vencida` como status físico.

Atraso deve ser calculado dinamicamente:

```txt
status in ('pendente', 'em_andamento', 'com_impedimento')
and due_date < hoje
```

---

## 3.4 `alvara_task_history`

Essa tabela deve registrar as alterações relevantes das tarefas.

### Campos recomendados

```sql
alvara_task_history
-------------------
id uuid primary key
task_id uuid not null references alvara_tasks(id)
event_type text not null
from_status text
to_status text
description text
metadata jsonb
created_at timestamp with time zone default now()
created_by uuid
```

### Eventos possíveis

```txt
created
status_changed
assigned
due_date_changed
document_attached
completed
cancelled
reopened
impediment_added
impediment_removed
```

---

## 3.5 `lifecycle_errors`

Essa tabela deve registrar falhas críticas do ciclo de vida.

### Campos recomendados

```sql
lifecycle_errors
----------------
id uuid primary key
company_alvara_id uuid references company_alvaras(id)
task_id uuid references alvara_tasks(id)
operation text not null
error_message text not null
payload jsonb
created_at timestamp with time zone default now()
resolved_at timestamp with time zone
resolved_by uuid
resolution_notes text
```

### Casos de uso

Registrar falhas em operações críticas, como:

- concluir tarefa;
- criar emissão;
- substituir documento atual;
- gerar próxima tarefa;
- calcular próximo vencimento;
- executar rollback;
- impedir duplicidade de ciclos.

---

## 4. Novas regras de status

O sistema deve trabalhar com dois status separados:

1. **Status documental do alvará**
2. **Status operacional da tarefa**

---

## 4.1 Status documental do alvará

Calculado a partir de `company_alvaras` + documento atual em `company_alvara_documents`.

### Status possíveis

```txt
sem_documento
vigente
vencido
indeterminado
dispensado
arquivado
suspenso
```

### Regras

```txt
is_exempt = true
=> dispensado
```

```txt
archived_at is not null
=> arquivado
```

```txt
monitoring_status = 'suspenso'
=> suspenso
```

```txt
não existe documento atual
=> sem_documento
```

```txt
documento atual com is_indefinite = true
=> indeterminado
```

```txt
documento atual com expiration_date >= hoje
=> vigente
```

```txt
documento atual com expiration_date < hoje
=> vencido
```

---

## 4.2 Status operacional da tarefa

Persistido no banco:

```txt
pendente
em_andamento
com_impedimento
concluida
cancelada
```

Status visual calculado:

```txt
pendente atrasada
em andamento atrasada
com impedimento atrasada
pendente dentro do prazo
concluida no prazo
concluida fora do prazo
cancelada
```

---

## 5. Novo ciclo de renovação

## 5.1 Fluxo correto

Quando uma tarefa é concluída:

```txt
1. Validar os dados informados
2. Criar novo documento em company_alvara_documents
3. Marcar documentos anteriores como is_current = false
4. Marcar novo documento como is_current = true
5. Atualizar tarefa atual como concluida
6. Vincular result_document_id na tarefa
7. Criar próxima tarefa futura, se aplicável
8. Registrar histórico
9. Finalizar transação
```

O ponto mais importante:

```txt
company_alvaras não deve ser resetada
```

O vínculo continua existindo.  
O documento atual é atualizado.  
A próxima tarefa representa o próximo ciclo.

---

## 5.2 Exemplo prático

### Antes da conclusão

```txt
Documento: vigente até 10/01/2026
Tarefa: em andamento
```

### Usuário conclui renovação

Informa:

```txt
nova emissão: 08/01/2026
novo vencimento: 08/01/2027
arquivo PDF
```

### Sistema cria

```txt
Documento 2026/2027 atual
Tarefa atual concluída
Nova tarefa futura pendente para 08/01/2027
```

### Depois da conclusão

```txt
Documento: vigente até 08/01/2027
Tarefa futura: pendente, oculta até entrar na janela operacional
```

---

## 6. Operação transacional obrigatória

A conclusão da tarefa deve ser feita em uma operação transacional.

Hoje, se o backend executar várias operações separadas e uma falhar no meio, podem ocorrer inconsistências como:

- tarefa concluída sem documento;
- documento criado sem próxima tarefa;
- próxima tarefa criada duplicada;
- documento atual incorreto;
- dashboard inconsistente.

### Recomendação

Criar uma função RPC no Supabase/Postgres.

Exemplo conceitual:

```sql
complete_alvara_task(
  p_task_id uuid,
  p_issue_date date,
  p_expiration_date date,
  p_is_indefinite boolean,
  p_file_path text,
  p_file_name text,
  p_notes text,
  p_user_id uuid
)
```

Essa função deve:

- validar tarefa;
- validar datas;
- criar documento;
- substituir documento atual;
- concluir tarefa;
- criar próxima tarefa;
- registrar histórico;
- registrar erro em `lifecycle_errors` se necessário;
- executar tudo em uma transação.

---

## 7. Mudanças no frontend

## 7.1 Cards do acompanhamento

Cada card deve mostrar separadamente:

```txt
Documento: Vigente até 08/01/2027
Tarefa: Em andamento
```

Ou:

```txt
Documento: Vencido desde 10/01/2026
Tarefa: Com impedimento
```

Ou:

```txt
Documento: Sem emissão
Tarefa: Pendente
```

Essa separação deixa o sistema mais claro para o usuário.

---

## 7.2 Kanban

O Kanban deve ser baseado 100% no status real da tarefa no banco.

### Colunas

```txt
Pendente
Em andamento
Com impedimento
Concluídas
Canceladas
```

### Remover como fonte da verdade operacional

```txt
notifique-acompanhamento-lanes
```

Essa chave pode deixar de existir ou ser ignorada para status real.

### Manter no localStorage apenas preferências visuais

Pode continuar usando localStorage para:

- modo de visualização;
- filtros;
- swimlanes expandidas/recolhidas;
- ordenação;
- preferências de interface.

Mas não para status operacional real.

---

## 7.3 Tela da empresa

Na tela da empresa, exibir algo como:

```txt
Alvará de Funcionamento

Status documental: Vigente
Documento atual: PDF anexado
Emissão: 08/01/2026
Vencimento: 08/01/2027
Próxima tarefa: Renovação pendente para 08/01/2027
Histórico: 2024, 2025, 2026
```

---

## 8. Mudanças no dashboard

O dashboard deve parar de inferir alvará ativo com base em tarefa concluída.

Com a nova modelagem, a fonte da verdade passa a ser:

```txt
company_alvaras
+ company_alvara_documents atual
+ alvara_tasks abertas
```

### Indicadores recomendados

#### Empresas em conformidade

Empresa ativa com:

```txt
pelo menos 1 alvará monitorado
e nenhum alvará obrigatório vencido ou sem documento
```

#### Empresas críticas

Empresa ativa com:

```txt
1 ou mais alvarás obrigatórios vencidos
ou sem documento quando obrigatório
```

#### Alvarás vigentes

```txt
documento atual com expiration_date >= hoje
ou is_indefinite = true
```

#### Alvarás vencidos

```txt
documento atual com expiration_date < hoje
```

#### Alvarás sem documento

```txt
company_alvaras obrigatório sem documento atual
```

#### Tarefas atrasadas

```txt
status in ('pendente', 'em_andamento', 'com_impedimento')
and due_date < hoje
```

#### Renovações futuras

```txt
tarefas de renovacao com due_date nos próximos 30, 60 e 90 dias
```

---

## 9. Plano de execução por fases

## Fase 0 — Preparação

Antes de alterar o sistema:

1. Criar backup do banco.
2. Exportar dados atuais.
3. Criar branch específica.
4. Criar ambiente de homologação.
5. Mapear todos os pontos que usam:
   - `company_alvaras.status`
   - `company_alvaras.data_emissao`
   - `company_alvaras.data_vencimento`
   - `alvara_tasks.status`
   - `localStorage` de lanes.

### Entrega

```txt
Inventário de impacto técnico
Backup seguro
Ambiente de teste
```

---

## Fase 1 — Criar novo modelo no banco

Criar migrations para:

1. `company_alvara_documents`
2. novos status de `alvara_tasks`
3. `lifecycle_errors`
4. ajustes em constraints
5. novos índices

### Índices recomendados

```sql
create index idx_company_alvara_documents_company_alvara_id
on company_alvara_documents(company_alvara_id);

create index idx_company_alvara_documents_expiration_date
on company_alvara_documents(expiration_date);

create unique index uniq_company_alvara_current_document
on company_alvara_documents(company_alvara_id)
where is_current = true;

create index idx_alvara_tasks_company_alvara_id_status
on alvara_tasks(company_alvara_id, status);

create index idx_alvara_tasks_due_date
on alvara_tasks(due_date);

create index idx_alvara_tasks_assigned_to
on alvara_tasks(assigned_to);

create index idx_lifecycle_errors_resolved_at
on lifecycle_errors(resolved_at);
```

### Entrega

```txt
Banco preparado para novo modelo
Campos antigos ainda mantidos
```

---

## Fase 2 — Migrar dados existentes

Criar script de migração.

Para cada `company_alvaras` com `data_emissao` ou `data_vencimento`:

```txt
criar registro em company_alvara_documents
marcar como is_current = true
copiar arquivo/anexo, se existir
vincular ao company_alvara_id
```

Para vínculos sem datas:

```txt
não criar documento
status documental será sem_documento
```

### Entrega

```txt
Dados antigos convertidos em documentos reais
```

---

## Fase 3 — Refatorar backend

Alterar APIs para usar o novo modelo.

### Rotas provavelmente afetadas

```txt
/api/alvara-tasks/[id]
/api/stats
/api/company-alvaras
/api/companies/[id]
/api/alvaras
```

### Prioridades

1. Criar função de cálculo de status documental.
2. Criar função de cálculo de status operacional.
3. Refatorar conclusão de tarefa.
4. Criar RPC transacional para ciclo de renovação.
5. Remover lógica que reseta `company_alvaras`.
6. Criar próxima tarefa com base no novo documento.

### Entrega

```txt
Backend operando com documentos e tarefas separados
```

---

## Fase 4 — Refatorar acompanhamento e Kanban

Alterar o acompanhamento para:

1. Ler `alvara_tasks.status` real do banco.
2. Atualizar status no backend ao arrastar card.
3. Remover `localStorage` como persistência operacional.
4. Manter `localStorage` apenas para preferências visuais.
5. Mostrar status documental e operacional separados no card.

### Entrega

```txt
Kanban multiusuário confiável
```

---

## Fase 5 — Refatorar dashboard

Reescrever os cálculos para considerar:

```txt
company_alvaras
company_alvara_documents atual
alvara_tasks abertas
```

Remover a lógica antiga:

```txt
company_alvaras pendente + tarefa concluída vigente = ativo
```

### Entrega

```txt
Dashboard mais simples, confiável e auditável
```

---

## Fase 6 — Histórico e auditoria

Implementar histórico forte para:

- mudança de status;
- troca de responsável;
- alteração de prazo;
- conclusão;
- cancelamento;
- impedimento;
- anexos;
- criação de documento;
- substituição de documento.

### Entrega

```txt
Rastreabilidade operacional completa
```

---

## Fase 7 — Limpeza dos campos legados

Após validação em produção/homologação, remover ou tornar somente leitura:

```txt
company_alvaras.status
company_alvaras.data_emissao
company_alvaras.data_vencimento
```

Recomendação: não remover imediatamente.

Primeiro manter em modo legado por uma ou duas versões.

Depois:

```sql
alter table company_alvaras drop column data_emissao;
alter table company_alvaras drop column data_vencimento;
alter table company_alvaras drop column status;
```

---

## 10. Ordem recomendada de execução

```txt
1. Criar tabela company_alvara_documents
2. Migrar emissões atuais para ela
3. Expandir status de alvara_tasks
4. Tirar andamento/impedimento do localStorage
5. Refatorar conclusão de tarefa
6. Criar RPC transacional
7. Parar de resetar company_alvaras
8. Refatorar dashboard
9. Refatorar cards e telas
10. Criar lifecycle_errors
11. Melhorar histórico/auditoria
12. Remover campos legados
```

---

## 11. O que não fazer

## 11.1 Não criar status `vencido` fixo no banco

Vencido é consequência da data.

Se hoje está vigente e amanhã passa da data, vira vencido automaticamente.

Salvar isso como status fixo cria risco de inconsistência.

---

## 11.2 Não manter `em andamento` em localStorage

Isso é aceitável em protótipo, mas ruim para produto real.

Estado operacional pertence ao banco.

---

## 11.3 Não resetar `company_alvaras`

O vínculo com o alvará não deve ser apagado ou zerado quando uma nova tarefa futura é criada.

---

## 11.4 Não usar tarefa concluída como fonte da verdade documental

A tarefa diz que o processo foi concluído.

O documento diz que o alvará existe e está válido.

A tarefa pode gerar o documento, mas não deve substituir o documento.

---

## 12. Critérios de aceite

A refatoração estará correta quando o sistema conseguir responder claramente:

### Para o alvará

```txt
Esse alvará é obrigatório?
Ele está dispensado?
Existe documento atual?
O documento atual está vigente?
Qual é o vencimento?
Qual é o arquivo?
Qual é o histórico de emissões?
```

### Para a tarefa

```txt
Existe tarefa aberta?
Ela é primeira emissão ou renovação?
Está pendente, em andamento ou impedida?
Está atrasada?
Quem é o responsável?
Quando deve ser concluída?
```

### Para o dashboard

```txt
Quantas empresas estão regulares?
Quantas têm documentos vencidos?
Quantas não têm documento?
Quantas tarefas estão atrasadas?
Quantas renovações vencem em 30/60/90 dias?
```

Sem precisar de gambiarras cruzando `company_alvaras.status = pendente` com tarefa concluída vigente.

---

## 13. Resumo executivo

A mudança robusta é:

```txt
company_alvaras deixa de representar o documento atual.
```

E passa a representar apenas:

```txt
empresa X precisa monitorar alvará Y.
```

O documento real passa para:

```txt
company_alvara_documents
```

A operação passa para:

```txt
alvara_tasks
```

O histórico passa para:

```txt
alvara_task_history
```

As falhas críticas passam para:

```txt
lifecycle_errors
```

---

## 14. Veredito

Essa refatoração é necessária se o objetivo é transformar o sistema em um produto confiável e escalável.

O modelo atual atende parcialmente e tem características de MVP, mas mistura conceitos importantes.

Para uma operação séria de compliance documental, a separação entre vínculo, documento, tarefa e auditoria é obrigatória.

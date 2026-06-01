# 🛡️ Regras de Negócio — Gestão e Monitoramento de Alvarás

Este documento reúne todas as especificações e regras de negócio estruturadas no portal, servindo como a **fonte única de verdade** para o funcionamento lógico das datas, do quadro de acompanhamento, do ciclo de vida das tarefas e de todos os indicadores analíticos do painel executivo.

---

## 📌 1. Mapeamento de Status Dinâmicos (Tempo Real)

O status exibido em cada alvará não é estático no banco de dados. Ele é calculado dinamicamente pelo sistema (`src/lib/utils.ts`) a cada renderização, cruzando os dados do vínculo (`company_alvaras`) com o estado e prazos das tarefas associadas (`alvara_tasks`).

Existem **13 status dinâmicos** calculados em tempo real:

| Status Visual | Regra de Cálculo | Significado Operacional |
| :--- | :--- | :--- |
| **`🚨 Pendente - Vencida`** | Vínculo sem data de emissão e cuja data limite de configuração (`inicio_obrigatorio_ate`) expirou **OU** tarefa não concluída cuja data limite/vencimento (`due_date`) expirou (`due_date < hoje`). | O prazo regulamentar para configurar o alvará ou iniciar o processo expirou. Ação imediata necessária. |
| **`⏳ Pendente - Não definida (restam X dias)`** | Vínculo sem data de emissão cadastrada, mas a data limite para início/configuração (`inicio_obrigatorio_ate`) está no futuro (mais de 1 dia restante). | O alvará foi vinculado à empresa, mas suas datas reais (emissão/vencimento) ainda não foram preenchidas. |
| **`⏳ Pendente - Não definida (resta 1 dia)`** | Vínculo sem data de emissão cadastrada, e a data limite para configuração é o dia de amanhã. | Faltam 24 horas para o limite de preenchimento ou início do processo de renovação. |
| **`⏳ Pendente - Não definida (hoje é o limite)`** | Vínculo sem data de emissão cadastrada, e a data limite para início/configuração é a data atual (`hoje`). | Último dia útil para a equipe cadastrar as informações do documento ou iniciar a renovação. |
| **`⏳ Pendente - Não definida`** | Vínculo sem data de emissão e sem data limite de início configurada. | Estado aguardando parametrização manual de datas e prazos. |
| **`⏳ Pendente - Vence em X dias`** | Tarefa não concluída, com validade cadastrada, e faltam **90 dias ou menos** para a data de vencimento (`due_date`). | Alerta preventivo de vencimento próximo (antecedência ideal de planejamento). |
| **`🛡️ Válido até DD/MM/AAAA`** | Tarefa não concluída, com vencimento cadastrado superior a **90 dias** no futuro. | Documento regularizado e operando dentro do período de total segurança. |
| **`🟠 Em Andamento - Vencido`** | Tarefa na coluna *Em Andamento*, mas a data limite de vencimento do alvará já passou (`due_date < hoje`). | O processo de renovação foi iniciado pela equipe, mas o alvará anterior expirou antes da nova emissão. |
| **`🟢 Em Andamento`** | Tarefa na coluna *Em Andamento* com data de vencimento futura ou sem data definida. | O processo de renovação está sendo trabalhado ativamente pela equipe dentro do prazo legal. |
| **`🔴 Com Impedimento - Vencido`** | Tarefa na coluna *Com Impedimento*, e a data limite de vencimento já passou. | O processo de renovação está travado por pendência externa grave com o alvará já vencido. |
| **`💗 Com Impedimento`** | Tarefa na coluna *Com Impedimento*, com vencimento futuro ou sem data definida. | Existe um gargalo externo (ex: vistoria, taxas, cliente) travando o andamento, mas o alvará segue vigente. |
| **`✅ Concluída`** | Tarefa concluída (`status = 'concluida'`) cuja data de conclusão (`completed_at`) ocorreu **dentro** do prazo limite (`due_date`). | O alvará foi emitido com sucesso e anexado ao sistema dentro do prazo de conformidade. |
| **`✅ Concluído - Vencido`** | Tarefa concluída, mas a data real de conclusão (`completed_at`) ocorreu **após** a data limite (`due_date` ou `inicio_obrigatorio_ate`). | O alvará foi conquistado e o processo concluído, mas o cliente ficou um período com o documento vencido. |
| **`❌ Cancelada`** | Tarefa cancelada no sistema (`status = 'cancelada'`). | O processo foi descontinuado (ex: encerramento da atividade, mudança de endereço ou dispensa do documento). |

---

## 🗂️ 2. Quadro de Acompanhamento (Kanban, Lista & Calendário)

O módulo de acompanhamento operacional organiza as tarefas através de um quadro visual dinâmico com três formas de visualização: Kanban (Quadro), Lista de tarefas estruturada e Calendário (prazos de vencimento).

### 2.1 Colunas do Kanban
As tarefas transitam entre **5 raias verticais (colunas)** que representam a maturidade do processo:
1. **`Pendente` (Não Iniciada)**: O alvará precisa ser renovado, mas a equipe ainda não iniciou os trâmites.
2. **`Em Andamento`**: O despachante ou equipe interna está ativamente providenciando as vistorias, taxas ou documentos.
3. **`Com Impedimento`**: O processo está travado por pendências externas (ex: exigência da prefeitura, falta de assinatura do cliente, taxas pendentes de pagamento).
4. **`Concluído`**: O alvará foi emitido e anexado ao sistema.
5. **`Canceladas`**: O processo foi descontinuado ou cancelado.

### 2.2 Persistência das Colunas (Operacional vs Banco de Dados)
Para simplificar o esquema do banco de dados e dar alta flexibilidade ao usuário, implementou-se um modelo híbrido:
* **No Banco de Dados**: Existem apenas 3 status físicos (`status` na tabela `alvara_tasks`): `"pendente"`, `"concluida"` e `"cancelada"`.
* **No Frontend (Interface)**: O estado `"pendente"` é desmembrado em 3 colunas virtuais (**Pendente**, **Em andamento** e **Com Impedimento**). A persistência dessa posição específica do cartão é salva no navegador por meio de armazenamento local (`localStorage`), utilizando a chave `"notifique-acompanhamento-lanes"`.
* Quando o usuário arrasta um cartão para **Concluído** ou **Canceladas**, o sistema dispara uma requisição de atualização física no banco de dados (`status = 'concluida'` ou `status = 'cancelada'`), o que dispara o ciclo de renovação automatizada. Se o cartão for trazido de volta a uma coluna de pendência, seu status físico retorna para `"pendente"`.

### 2.3 Regra de Visibilidade de 90 Dias (Ocultação de Prazos Longos)
Para evitar sobrecarga cognitiva e poluição visual no quadro de trabalho diário:
* Tarefas pendentes cujas datas limite/vencimento (`due_date`) estejam a **mais de 90 dias no futuro** são ocultadas por padrão das visualizações do acompanhamento.
* O usuário pode visualizá-las a qualquer momento selecionando a opção especial **"Ocultos (> 90 dias)"** no filtro de vencimento por Anos.

### 2.4 Raias Horizontais (Swimlanes)
O Kanban suporta agrupamento horizontal em tempo real para segmentação do fluxo:
* **Por Empresa**: Cria raias dedicadas a cada cliente, facilitando a visualização da carteira documental completa por CNPJ.
* **Por Responsável**: Agrupa as tarefas pelo colaborador designado ao cliente, ideal para balanceamento de carga de trabalho e gestão de metas da equipe.
* *Os estados expandidos/recolhidos de cada raia horizontal são memorizados no navegador via chave `"notifique-acompanhamento-collapsed-swimlanes"`, assim como a modalidade de raia ativa via chave `"notifique-acompanhamento-swimlane"`.*

---

## 🔄 3. Ciclo de Renovação Automática (Fluxo Preventivo)

Para garantir que o cliente nunca fique desprotegido, a aplicação implementa um modelo de **renovação preventiva de ciclo contínuo**:

```mermaid
graph TD
    A[Tarefa Ciclo Atual: Em Andamento / Impedimento] -->|Usuário Conclui Tarefa| B(Sistema Registra Validade)
    B --> C[Backend Atualiza Vínculo Principal]
    C -->|Reseta data_emissao para null| D[company_alvaras]
    C -->|Reseta data_vencimento para null| D
    C -->|Reseta status para pendente| D
    D --> E[Geração Automática do Próximo Ciclo]
    E -->|Gera Nova Tarefa Pendente| F[Nova Tarefa: Pendente]
    F -->|due_date = data_vencimento anterior| G[Fila de Trabalho Futura]
```

### Regras do Gatilho:
1. Quando uma tarefa é concluída (`status = 'concluida'`), o backend calcula a validade do documento recém-conquistado e salva as informações históricas.
2. Para abrir caminho para o monitoramento do próximo ciclo (geralmente no ano seguinte), o vínculo principal (`company_alvaras`) é preventivamente resetado no banco:
    * `data_emissao = null`
    * `data_vencimento = null`
    * `status = "pendente"`
3. **Geração Preventiva**: O backend cria imediatamente uma **nova tarefa** com status `"pendente"`, cujo vencimento (`due_date`) é definido exatamente para o vencimento do alvará que acabou de ser concluído.
4. Dessa forma, o ciclo futuro já entra na fila de planejamento de forma transparente, garantindo que o alvará nunca deixe de ser monitorado.
5. **Auditoria e Logs de Falha**: Caso ocorra alguma falha grave de integridade de dados durante a transição do ciclo ou falha no rollback de estados, o sistema registra uma ocorrência na tabela `public.lifecycle_errors` para análise de suporte do administrador do sistema, garantindo a robustez operacional de ponta a ponta.

---

## 📊 4. Indicadores do Dashboard e Acompanhamento Geral

O painel de indicadores (Dashboard) e o módulo de acompanhamento consolidam métricas em tempo real para permitir auditoria rápida e visão executiva sobre a conformidade de toda a carteira de clientes.

### 4.1 Conformidade Geral (Compliance Rate)
O indicador principal de saúde da carteira é medido em percentual (`0% a 100%`) e segue a seguinte fórmula:

$$\text{Índice de Conformidade} = \left( \frac{\text{Empresas em Conformidade}}{\text{Total de Empresas Ativas}} \right) \times 100$$

* **Total de Empresas Ativas**: Todas as empresas cadastradas no portal que não estejam arquivadas (`archived_at IS NULL`).
* **🟢 Empresa em Conformidade (Regular)**: Uma empresa ativa que possui **pelo menos 1 alvará vinculado/monitorado** (`total_alvaras > 0`) e **0 alvarás vencidos** (`alvaras_vencidos === 0`).
* **🔴 Empresa Crítica (Com Pendência)**: Uma empresa ativa que possui **1 ou mais alvarás vencidos** em seu portfólio.
* **⚪ Empresa Não Monitorada (Sem Alvarás)**: Uma empresa cadastrada que **não possui nenhum alvará vinculado**.
* *Nota de Cálculo*: Pelo fluxo atual implementado, as empresas não monitoradas participam do denominador (`Total de Empresas Ativas`) mas não somam no numerador (`Empresas em Conformidade`), servindo como incentivo para a equipe vincular alvarás e não inflar artificialmente a saúde do painel.

### 4.2 Lógica Analítica de "Alvarás Ativos" (Tempo Real)
Devido ao ciclo de renovação preventiva (que zera as datas do vínculo no banco para `"pendente"` a fim de planejar o ciclo seguinte), o cálculo dos **Alvarás Ativos** cruza as informações em tempo real no servidor para evitar relatórios falsos de inatividade:

Um alvará é computado e exibido como **Ativo (Emitido)** se:
1. O status do seu vínculo no banco (`company_alvaras`) for `"emitido"`.
2. **OU** se o status do seu vínculo for `"pendente"`, mas houver uma **tarefa concluída vigente** (`status = 'concluida'`) cuja data de validade (`due_date`) ainda esteja no futuro (`due_date >= hoje`).

> [!TIP]
> Graças a essa inteligência analítica em memória, empresas com alvarás válidos não sofrem com indicadores zerados de `"Ativos"` no painel durante o ciclo de planejamento da renovação futura.

### 4.3 Significado de Cada Indicador do Dashboard

O painel consolida mais de **10 KPIs e métricas** operacionais:

1. **Índice de Conformidade Geral**: Taxa percentual de empresas regulares em relação ao total de ativas (conforme seção 4.1).
2. **Empresas Críticas (Top 5)**: Relação das 5 empresas com o maior número de alvarás vencidos no momento. Ajuda a equipe a priorizar os planos de ação.
3. **Projeção de Vencimentos (Alertas)**: Contagem de alvarás cujas datas de vencimento reais expiram em 30, 60 e 90 dias no futuro. Ideal para prever a carga de renovações dos próximos meses.
4. **Throughput de Tarefas (Conclusão Mensal)**: Taxa percentual de eficiência operacional do mês corrente: `(Tarefas Concluídas no Mês / Total de Tarefas Criadas no Mês) * 100`.
5. **Distribuição do Backlog de Tarefas**: Divisão quantitativa das tarefas ativas totais registradas por status físico do banco: `Pendentes` (aguardando ação), `Concluídas` (sucesso no ciclo) e `Canceladas`.
6. **Carga de Trabalho por Responsável**: Total de empresas monitoradas agrupadas pelo colaborador encarregado (`profiles` cadastrados). Facilita o balanceamento de atividades e metas internas.
7. **Concentração Geográfica por UF**: Total de alvarás monitorados distribuídos pelo Estado (UF) de registro da empresa, mapeando a distribuição territorial da carteira.
8. **Histórico Sazonal (Fluxo Mensal)**: Gráfico de série temporal dos últimos 6 meses comparando a quantidade de novos processos gerados (entradas) contra processos concluídos (saídas).
9. **Taxa de Cobertura Documental (Uploads)**: `(Alvarás com arquivo PDF anexado / Total de Alvarás Vinculados) * 100`. Mede o nível de digitalização e organização da plataforma.
10. **Alvarás com Validade Indeterminada**: Quantidade de documentos ativos (`status = 'emitido'`) parametrizados como permanentes, ou seja, sem data de expiração cadastrada (`data_vencimento IS NULL`).
11. **Score de Regularidade de Alvarás**: `((Total de Alvarás - Alvarás Vencidos) / Total de Alvarás) * 100`. Uma visão direta e global de saúde dos documentos independentemente do agrupamento de CNPJ.

---

## 🗓️ 5. Cálculo de Datas de Vencimento e Prazos

O sistema prevê alta flexibilidade de parametrização para as datas limites de cada documento.

### 5.1 Frequências de Renovação Suportadas
As periodicidades regulamentares de vigência de alvará são configuráveis no cadastro:
* `mensal` (1 mês)
* `bimestral` (2 meses)
* `trimestral` (3 meses)
* `semestral` (6 meses)
* `anual` (1 ano)
* `bienal` (2 anos)
* `trienal` (3 anos)
* `quadrienal` (4 anos)
* `quinquenal` (5 anos)
* `personalizada` (Exige input manual de datas pelo usuário)

### 5.2 Ajustes de Fim de Semana (Weekend Adjust)
Para evitar que prazos regulamentares expirem em dias não úteis, o sistema recalcula as datas finais automaticamente:
* **`no_adjust`**: Mantém a data exata calculada pela frequência.
* **`previous_business_day`**: Se a data calculada cair em um Sábado ou Domingo, move o prazo limite para a **Sexta-feira anterior**.
* **`next_business_day`**: Se a data calculada cair em um Sábado ou Domingo, move o prazo limite para a **Segunda-feira seguinte**.

### 5.3 Prazo de Início (`prazo_inicio_dias`)
Parâmetro numérico (padrão: 30 dias) definido no tipo de alvará que dita com quantos dias de antecedência a tarefa de renovação deve ser destacada e iniciada antes do vencimento real do documento anterior.

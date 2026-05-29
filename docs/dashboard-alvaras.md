# Dashboard de Acompanhamento de Alvarás
## Especificação de Indicadores

---

## 1. Cards de Alerta (Topo do Dashboard)

Exibidos em destaque como KPIs principais, com cor e ícone indicando criticidade.

| Indicador | Descrição | Cor sugerida |
|---|---|---|
| **Alvarás Vencidos** | Total de alvarás com `data_vencimento < hoje` | Vermelho |
| **Vencendo em 30 dias** | Total com vencimento entre hoje e D+30 | Laranja |
| **Vencendo em 60 dias** | Total com vencimento entre D+31 e D+60 | Amarelo |
| **Score de Regularidade** | % de alvarás válidos sobre o total cadastrado | Verde/Vermelho dinâmico |

**Fórmula do Score de Regularidade:**
```
Score = (Alvarás válidos / Total de alvarás) × 100
```

---

## 2. Painel Kanban — Visão Agregada

Resumo numérico dos cards do Kanban, sem substituir a tela de Kanban.

| Indicador | Descrição |
|---|---|
| **Total Pendente** | Alvarás/tarefas com status = Pendente |
| **Total Em Andamento** | Alvarás/tarefas com status = Em Andamento |
| **Total Concluído** | Alvarás/tarefas com status = Concluído |
| **Total Impedimento** | Alvarás/tarefas com status = Impedimento ⚠️ |
| **Taxa de Conclusão** | % de tarefas com checklist 100% completo |
| **Tempo Médio de Ciclo** | Média de dias entre status Pendente → Concluído |

---

## 3. Gráficos Principais

### 3.1 Vencimentos por Mês (Gráfico de Barras)
- **Eixo X:** Meses (ex: Jan, Fev, Mar...)
- **Eixo Y:** Quantidade de alvarás vencendo
- **Objetivo:** Antecipar picos de renovação e planejar ação

### 3.2 Distribuição por Status Kanban (Gráfico de Pizza / Donut)
- Fatias: Pendente / Em Andamento / Concluído / Impedimento
- **Objetivo:** Fotografia instantânea da saúde operacional

### 3.3 Evolução de Regularidade (Gráfico de Linha — opcional)
- Score mês a mês
- **Objetivo:** Mostrar evolução e tendência de melhoria ou piora

---

## 4. Visão por Empresa

Tabela ou lista ranqueada com foco em criticidade.

| Indicador | Descrição |
|---|---|
| **Empresas com alvarás vencidos** | Lista das empresas em situação irregular |
| **Empresas com vencimento iminente** | Empresas com ao menos 1 alvará vencendo em 30 dias |
| **Empresas sem alvarás cadastrados** | Alerta de lacuna no controle |
| **Ranking de criticidade** | Empresa com mais alvarás problemáticos no topo |

---

## 5. Tabela de Próximos Vencimentos

Lista priorizada dos alvarás mais urgentes.

| Campo | Descrição |
|---|---|
| Empresa | Nome da empresa |
| Tipo de Alvará | Ex: Funcionamento, Vigilância Sanitária, Bombeiros |
| Data de Vencimento | Data formatada |
| Dias Restantes | Calculado dinamicamente (pode ficar negativo se vencido) |
| Status Kanban | Badge colorido |
| Progresso Checklist | Barra de progresso (%) |

**Ordenação sugerida:** Dias restantes crescente (vencidos primeiro, depois mais próximos).

---

## 6. Indicadores de Checklist

| Indicador | Descrição |
|---|---|
| **Checklist médio de conclusão** | Média de % de itens concluídos entre todos os alvarás ativos |
| **Alvarás sem checklist iniciado** | Total com 0% de progresso e status ≠ Concluído |
| **Alvarás prontos para concluir** | Checklist 100% mas status ainda não é Concluído |

O último indicador é especialmente útil para identificar alvarás "travados" que já cumpriram todas as etapas mas não foram finalizados.

---

## 7. Layout Sugerido do Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  [Vencidos]  [Vencendo 30d]  [Em Impedimento]  [Score %]        │  ← Linha 1: KPI Cards
├──────────────────────────────┬──────────────────────────────────┤
│  Barras: Vencimentos/Mês     │  Donut: Status Kanban            │  ← Linha 2: Gráficos
├──────────────────────────────┴──────────────────────────────────┤
│  Tabela: Próximos Vencimentos (com dias restantes e checklist)  │  ← Linha 3: Tabela
├─────────────────────────────────────────────────────────────────┤
│  Ranking de Empresas Críticas  |  Alvarás sem checklist         │  ← Linha 4: Secundários
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Queries Supabase de Referência

```sql
-- Alvarás vencidos
SELECT COUNT(*) FROM alvaras WHERE data_vencimento < NOW();

-- Vencendo em 30 dias
SELECT COUNT(*) FROM alvaras
WHERE data_vencimento BETWEEN NOW() AND NOW() + INTERVAL '30 days';

-- Score de regularidade
SELECT
  ROUND(
    COUNT(*) FILTER (WHERE data_vencimento >= NOW()) * 100.0 / COUNT(*), 1
  ) AS score_regularidade
FROM alvaras;

-- Vencimentos por mês (próximos 6 meses)
SELECT
  TO_CHAR(data_vencimento, 'YYYY-MM') AS mes,
  COUNT(*) AS total
FROM alvaras
WHERE data_vencimento BETWEEN NOW() AND NOW() + INTERVAL '6 months'
GROUP BY mes
ORDER BY mes;

-- Empresas com alvarás vencidos
SELECT e.nome, COUNT(*) as alvaras_vencidos
FROM alvaras a
JOIN empresas e ON e.id = a.empresa_id
WHERE a.data_vencimento < NOW()
GROUP BY e.nome
ORDER BY alvaras_vencidos DESC;

-- Alvarás prontos para concluir (checklist 100%, status != concluído)
SELECT * FROM alvaras
WHERE progresso_checklist = 100
  AND status != 'concluido';
```

---

## 9. Prioridade de Implementação

| Fase | Indicadores |
|---|---|
| **MVP** | Vencidos, Vencendo 30d, Score de Regularidade, Tabela de próximos vencimentos |
| **Fase 2** | Donut Kanban, Gráfico de barras mensais, Visão por empresa |
| **Fase 3** | Tempo médio de ciclo, Evolução do score, Checklist analytics |

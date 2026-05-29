# Guia de Indicadores para Sites de Gestão de Tarefas e Processos

> Aplicável a sistemas de gestão de alvarás, licenças, documentos, demandas e qualquer fluxo de trabalho com status e prazos.

---

## 1. Indicadores de Volume

Medem **o que existe** no sistema — o tamanho do inventário de tarefas/processos.

| # | Nome | Descrição | Fórmula / Lógica |
|---|------|-----------|-----------------|
| 1 | Total de itens cadastrados | Quantidade total de registros no sistema | `COUNT(*)` |
| 2 | Total por status | Quantidade agrupada por cada estado do fluxo | `COUNT(*) GROUP BY status` |
| 3 | Total por empresa / unidade | Itens distribuídos por entidade responsável | `COUNT(*) GROUP BY empresa_id` |
| 4 | Total por tipo | Itens agrupados por categoria (ex.: alvará sanitário, bombeiros, etc.) | `COUNT(*) GROUP BY tipo` |
| 5 | Total por responsável | Quantidade atribuída a cada usuário ou equipe | `COUNT(*) GROUP BY responsavel_id` |
| 6 | Total por município | Itens segmentados por localidade de competência | `COUNT(*) GROUP BY municipio` |
| 7 | Total por órgão emissor | Distribuição por entidade governamental responsável | `COUNT(*) GROUP BY orgao_emissor` |
| 8 | Total por ano de abertura | Evolução histórica do volume de processos abertos | `COUNT(*) GROUP BY YEAR(data_abertura)` |
| 9 | Total por trimestre | Sazonalidade de abertura de processos | `COUNT(*) GROUP BY quarter` |
| 10 | Total por CNAE / atividade | Itens agrupados por atividade econômica | `COUNT(*) GROUP BY cnae` |

---

## 2. Indicadores de Status e Andamento

Medem **em que fase** cada item se encontra no fluxo.

| # | Nome | Descrição | Fórmula / Lógica |
|---|------|-----------|-----------------|
| 11 | Itens emitidos | Processos concluídos com documento válido gerado | `status = 'emitido'` |
| 12 | Itens em andamento | Processos com tramitação ativa no órgão | `status = 'em_andamento'` |
| 13 | Itens pendentes | Aguardando ação interna ou complementação | `status = 'pendente'` |
| 14 | Itens vencidos | Prazo expirado sem renovação ou conclusão | `data_vencimento < hoje` |
| 15 | Itens cancelados | Processos encerrados sem conclusão | `status = 'cancelado'` |
| 16 | Itens em renovação | Com processo de renovação ativo | `status = 'renovando'` |
| 17 | Itens aguardando vistoria | Dependentes de inspeção presencial | `status = 'aguardando_vistoria'` |
| 18 | Itens com recurso aberto | Com contestação ou recurso administrativo em curso | `status = 'recurso'` |
| 19 | Itens arquivados | Histórico de itens encerrados e arquivados | `status = 'arquivado'` |
| 20 | Itens sem status definido | Registros incompletos ou importados sem classificação | `status IS NULL` |

---

## 3. Indicadores de Prazo e Vencimento

Medem **quando** as coisas precisam acontecer e o risco temporal.

| # | Nome | Descrição | Fórmula / Lógica |
|---|------|-----------|-----------------|
| 21 | Vencendo em 7 dias | Alerta crítico de prazo iminente | `data_vencimento BETWEEN hoje AND hoje+7` |
| 22 | Vencendo em 30 dias | Alerta preventivo de prazo próximo | `data_vencimento BETWEEN hoje AND hoje+30` |
| 23 | Vencendo em 90 dias | Visibilidade de médio prazo para planejamento | `data_vencimento BETWEEN hoje AND hoje+90` |
| 24 | Já vencidos há menos de 30 dias | Vencimentos recentes ainda recuperáveis | `data_vencimento BETWEEN hoje-30 AND hoje` |
| 25 | Já vencidos há mais de 90 dias | Situação crítica de compliance | `data_vencimento < hoje-90` |
| 26 | Dias restantes por item | Campo calculado de contagem regressiva | `data_vencimento - hoje` |
| 27 | Dias desde a abertura | Tempo de vida do processo no sistema | `hoje - data_abertura` |
| 28 | Dias desde a última atualização | Identifica processos parados | `hoje - ultima_atualizacao` |
| 29 | Tempo médio até vencimento (ativos) | Folga média dos itens válidos | `AVG(data_vencimento - hoje) WHERE status = 'emitido'` |
| 30 | Itens sem data de vencimento cadastrada | Registros incompletos que não entram nos alertas | `data_vencimento IS NULL` |

---

## 4. Indicadores de Eficiência e Tempo de Processo

Medem **quão rápido** o fluxo acontece e onde há gargalos.

| # | Nome | Descrição | Fórmula / Lógica |
|---|------|-----------|-----------------|
| 31 | Tempo médio de emissão | Média de dias entre abertura e conclusão | `AVG(data_emissao - data_abertura)` |
| 32 | Tempo médio por tipo | Tempo de emissão segmentado por categoria | `AVG(ciclo) GROUP BY tipo` |
| 33 | Tempo médio por responsável | Identifica diferenças de performance entre pessoas | `AVG(ciclo) GROUP BY responsavel_id` |
| 34 | Tempo médio por órgão | Benchmark do prazo real de cada repartição | `AVG(ciclo) GROUP BY orgao_emissor` |
| 35 | Tempo médio por município | Comparativo de agilidade entre cidades | `AVG(ciclo) GROUP BY municipio` |
| 36 | Tempo médio em status pendente | Quanto tempo os processos ficam parados aguardando ação | `AVG(saida_pendente - entrada_pendente)` |
| 37 | Processo mais longo ativo | Identifica o outlier que mais demora | `MAX(hoje - data_abertura) WHERE status ativo` |
| 38 | Processos acima do prazo esperado | SLA estourado (ex.: mais de 60 dias em andamento) | `ciclo > sla_esperado` |
| 39 | Percentual dentro do SLA | % de emissões concluídas no prazo definido | `emitidos_no_prazo / total_emitidos × 100` |
| 40 | Tendência do tempo médio (MoM) | Melhora ou piora mês a mês no tempo de emissão | `AVG(ciclo) por mês comparado ao anterior` |

---

## 5. Indicadores de Taxa e Proporção

Medem **relações entre grupos** para revelar padrões.

| # | Nome | Descrição | Fórmula / Lógica |
|---|------|-----------|-----------------|
| 41 | Taxa de conclusão | % de processos concluídos sobre o total | `emitidos / total × 100` |
| 42 | Taxa de pendência | % de processos parados aguardando ação | `pendentes / total × 100` |
| 43 | Taxa de vencimento | % de itens com prazo expirado | `vencidos / total × 100` |
| 44 | Taxa de cancelamento | % de processos que não chegam à conclusão | `cancelados / total × 100` |
| 45 | Taxa de renovação antecipada | % que iniciaram renovação antes do vencimento | `renovados_antes / total_renovados × 100` |
| 46 | Taxa de conformidade geral | % de empresas com todos os alvarás válidos | `empresas_ok / total_empresas × 100` |
| 47 | Taxa de itens sem responsável | % de processos sem pessoa atribuída | `sem_responsavel / total × 100` |
| 48 | Taxa de retrabalho | % que retornaram ao status anterior após avançar | `retornos / total × 100` |
| 49 | Taxa de sucesso por tipo | Comparação de conclusão entre categorias | `emitidos_por_tipo / total_por_tipo × 100` |
| 50 | Taxa de cobertura documental | % de itens com todos os documentos obrigatórios anexados | `com_docs_completos / total × 100` |

---

## 6. Indicadores de Risco e Compliance

Medem **exposição jurídica, operacional e regulatória**.

| # | Nome | Descrição | Fórmula / Lógica |
|---|------|-----------|-----------------|
| 51 | Empresas com alvará vencido | Unidades operando em situação irregular | `COUNT DISTINCT empresa WHERE status = 'vencido'` |
| 52 | Empresas sem nenhum alvará válido | Risco máximo de autuação | `empresas sem item com status = 'emitido'` |
| 53 | Itens em área de risco crítico | Alvarás de segurança, sanitários ou ambientais vencidos | `tipo IN ('sanitario','bombeiros') AND vencido` |
| 54 | Processos com pendência há mais de 60 dias | Itens paralisados por tempo excessivo | `status = 'pendente' AND tempo_parado > 60` |
| 55 | Alvarás com validade inferior a 6 meses | Janela de atenção para renovação planejada | `data_vencimento < hoje + 180` |
| 56 | Processos sem movimentação há 30 dias | Possível abandono ou esquecimento | `ultima_atualizacao < hoje - 30 AND status ativo` |
| 57 | Itens com data de vencimento retroativa e ainda ativos | Inconsistência de dados — risco silencioso | `data_vencimento < hoje AND status = 'emitido'` |
| 58 | Alvarás com documentos próximos do prazo | Documentos de suporte que vencem antes do alvará | `doc_vencimento < hoje + 30` |
| 59 | Índice de risco por empresa | Score agregado de exposição por unidade | `(vencidos + pendentes_críticos) / total_por_empresa` |
| 60 | Histórico de autuações registradas | Empresas que já sofreram penalidades por irregularidade | `COUNT(*) WHERE autuado = true` |

---

## 7. Indicadores de Produtividade da Equipe

Medem **o desempenho das pessoas** responsáveis pelo acompanhamento.

| # | Nome | Descrição | Fórmula / Lógica |
|---|------|-----------|-----------------|
| 61 | Itens concluídos por responsável (mês) | Volume de emissões por pessoa no período | `COUNT(emitidos) GROUP BY responsavel AND mês` |
| 62 | Itens abertos por responsável | Carga atual de trabalho de cada pessoa | `COUNT(ativos) GROUP BY responsavel` |
| 63 | Tempo médio de resposta por responsável | Quanto tempo leva para mover um item pendente | `AVG(saida_pendente - entrada_pendente) GROUP BY resp` |
| 64 | Taxa de SLA cumprido por responsável | % de emissões no prazo por pessoa | `cumpridos / total GROUP BY responsavel` |
| 65 | Itens abandonados por responsável | Processos atribuídos sem movimentação | `sem_ação > 15d GROUP BY responsavel` |
| 66 | Volume de atualizações por responsável | Atividade geral de registro e movimentação | `COUNT(logs) GROUP BY responsavel` |
| 67 | Ranking de conclusões no mês | Gamificação leve do desempenho da equipe | `TOP N por emitidos no mês` |
| 68 | Carga de trabalho projetada | Estimativa de volume para as próximas semanas | `itens com prazo nos próximos 30d sem responsável` |
| 69 | Itens transferidos entre responsáveis | Rastreia redistribuições e possíveis gargalos de equipe | `COUNT(mudancas_responsavel)` |
| 70 | Tempo médio sem ação após atribuição | Quanto tempo o item fica parado após ser atribuído | `AVG(primeira_acao - data_atribuicao)` |

---

## 8. Indicadores de Tendência e Evolução

Medem **como o cenário muda ao longo do tempo**.

| # | Nome | Descrição | Fórmula / Lógica |
|---|------|-----------|-----------------|
| 71 | Novos itens abertos por mês | Crescimento ou redução do volume de demandas | `COUNT(data_abertura) GROUP BY mês` |
| 72 | Itens concluídos por mês | Capacidade de entrega ao longo do tempo | `COUNT(data_emissao) GROUP BY mês` |
| 73 | Itens vencidos por mês | Evolução do risco de compliance | `COUNT(vencimentos) GROUP BY mês` |
| 74 | Saldo do período (abertos − fechados) | Backlog crescendo ou diminuindo | `abertos_mês - fechados_mês` |
| 75 | Taxa de crescimento do backlog (MoM) | % de variação mês a mês na fila de pendências | `(backlog_mês - backlog_anterior) / backlog_anterior` |
| 76 | Evolução do tempo médio de emissão | Tendência de aceleração ou lentidão no processo | `AVG(ciclo) por mês em série histórica` |
| 77 | Comparativo ano a ano (YoY) | Performance atual vs. mesmo período do ano anterior | `período atual vs. período - 12 meses` |
| 78 | Previsão de vencimentos por mês | Planejamento antecipado da carga de renovações | `COUNT(vencimentos futuros) GROUP BY mês` |
| 79 | Acumulado de emissões no ano (YTD) | Progresso em relação à meta anual | `COUNT(emitidos) WHERE ano = atual` |
| 80 | Heatmap de atividade (dia da semana × hora) | Quando a equipe mais atualiza e conclui processos | `COUNT(logs) GROUP BY dia_semana, hora` |

---

## 9. Indicadores Financeiros e de Custo

Medem o **impacto econômico** da gestão de licenças.

| # | Nome | Descrição | Fórmula / Lógica |
|---|------|-----------|-----------------|
| 81 | Custo total de taxas e emolumentos | Soma dos valores pagos em taxas governamentais no período | `SUM(valor_taxa)` |
| 82 | Custo médio por tipo de alvará | Benchmark de custo por categoria | `AVG(valor_taxa) GROUP BY tipo` |
| 83 | Custo médio por município | Comparativo de encargos entre localidades | `AVG(valor_taxa) GROUP BY municipio` |
| 84 | Projeção de custo de renovações futuras | Estimativa de desembolso nos próximos 12 meses | `SUM(valor_estimado WHERE vence_em_12_meses)` |
| 85 | Custo de multas e autos de infração | Impacto financeiro da não conformidade | `SUM(valor_multa)` |
| 86 | Economia gerada por renovação antecipada | Multas evitadas pela gestão proativa | `multas_evitadas = multas_históricas × taxa_antecipação` |
| 87 | Custo por empresa | Total de taxas e emolumentos agrupado por CNPJ | `SUM(valor_taxa) GROUP BY empresa_id` |
| 88 | Taxa de crescimento do custo YoY | Variação do gasto total em taxas ano a ano | `(custo_ano - custo_ano_anterior) / custo_ano_anterior` |
| 89 | Valor em risco (alvarás vencidos) | Estimativa de multas potenciais por irregularidade | `COUNT(vencidos) × multa_média_estimada` |
| 90 | Retorno sobre gestão proativa | Redução de multas vs. custo da equipe de compliance | `multas_evitadas / custo_operacional` |

---

## 10. Indicadores de Qualidade de Dados

Medem a **integridade e completude** dos registros no sistema.

| # | Nome | Descrição | Fórmula / Lógica |
|---|------|-----------|-----------------|
| 91 | Itens com cadastro incompleto | Registros faltando campos obrigatórios | `campos_obrigatórios IS NULL` |
| 92 | Itens sem documentos anexados | Processos que ainda não têm arquivo vinculado | `COUNT(documentos) = 0` |
| 93 | Itens com data de vencimento inconsistente | Datas retroativas em registros ativos | `data_vencimento < data_abertura` |
| 94 | Duplicatas potenciais | Registros com CNPJ + tipo + município repetidos | `GROUP BY cnpj, tipo, municipio HAVING COUNT > 1` |
| 95 | Taxa de atualização de registros | % de itens ativos com pelo menos 1 atualização no último mês | `atualizados_30d / total_ativos × 100` |
| 96 | Itens importados sem validação | Registros vindos de planilhas ou integrações sem revisão | `origem = 'importacao' AND validado = false` |
| 97 | Histórico de alterações por item | Rastreabilidade de quem mudou o quê e quando | `COUNT(logs) GROUP BY item_id` |
| 98 | Itens com responsável desativado | Processos cujo usuário responsável não existe mais no sistema | `responsavel_id NOT IN (users ativos)` |
| 99 | Score de completude médio | Média de campos preenchidos por registro (0–100%) | `AVG(campos_preenchidos / campos_totais × 100)` |
| 100 | Última sincronização com fonte externa | Para sistemas integrados: quando foi a última atualização via API | `MAX(ultima_sync) por fonte de dados` |

---

## Como Priorizar os Indicadores

Para não exibir todos de uma vez, use a seguinte lógica de prioridade no seu dashboard:

### Dashboard principal (sempre visível)
- Total por status (indicadores 1–10)
- Vencendo em 30 dias (#22)
- Empresas com alvará vencido (#51)
- Taxa de conclusão (#41)
- Taxa de conformidade geral (#46)

### Painel de alertas (notificações ativas)
- Vencendo em 7 dias (#21)
- Processos sem movimentação há 30 dias (#56)
- Itens com pendência há mais de 60 dias (#54)
- Inconsistências de dados (#93, #94)

### Relatório gerencial (mensal)
- Tendência e evolução (indicadores 71–80)
- Produtividade da equipe (indicadores 61–70)
- Financeiros (indicadores 81–90)

### Auditoria de dados (trimestral)
- Qualidade de dados (indicadores 91–100)

---

## Mapeamento para o Modelo de Dados (Supabase)

Campos mínimos recomendados para viabilizar todos os 100 indicadores:

```sql
CREATE TABLE alvaras (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID REFERENCES empresas(id),
  tipo          TEXT,           -- 'sanitario', 'bombeiros', 'funcionamento', etc.
  status        TEXT,           -- 'pendente', 'em_andamento', 'emitido', 'vencido', 'renovando', 'cancelado'
  municipio     TEXT,
  orgao_emissor TEXT,
  responsavel_id UUID REFERENCES usuarios(id),
  data_abertura  DATE NOT NULL,
  data_emissao   DATE,
  data_vencimento DATE,
  valor_taxa     NUMERIC(12,2),
  cnae           TEXT,
  origem         TEXT DEFAULT 'manual', -- 'manual', 'importacao', 'api'
  validado       BOOLEAN DEFAULT true,
  ultima_atualizacao TIMESTAMPTZ DEFAULT now(),
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE alvara_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alvara_id   UUID REFERENCES alvaras(id),
  usuario_id  UUID REFERENCES usuarios(id),
  campo       TEXT,
  valor_antes TEXT,
  valor_depois TEXT,
  criado_em   TIMESTAMPTZ DEFAULT now()
);
```

---

*Guia gerado para sistemas de gestão de alvarás, licenças e processos administrativos.*  
*Adaptável a qualquer plataforma com banco relacional (PostgreSQL/Supabase).*

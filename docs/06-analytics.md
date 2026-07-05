---
title: "Analytics Executivo"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Arquitetura e Engenharia"
status: "Em evolução"
---

# 06. Analytics Executivo

## 📌 Índice
1. [Objetivo e Responsabilidade](#objetivo-e-responsabilidade)
2. [Painel e KPIs (Admin Dashboard)](#painel-e-kpis-admin-dashboard)
3. [Materialized Views e Cache](#materialized-views-e-cache)
4. [Riscos e Futuro](#riscos-e-futuro)

---

## 🎯 Objetivo e Responsabilidade
Prover um backoffice para os donos da plataforma monitorarem a saúde (Health Check) das finanças e conversões sem depender unicamente de ferramentas de terceiros (onde a amostragem de dados é comum).
O dashboard consome da fonte primária: o próprio PostgreSQL do NexusSaaS.

---

## 📊 Painel e KPIs (Admin Dashboard)

O arquivo `admin-dashboard.html` usa a biblioteca Open Source **Chart.js** via CDN.
Ele se alimenta de RPCs no Supabase que devolvem os agregados.

**Métricas Core Visualizadas:**
1. **MRR e Receita Today:** Receita transacionada confirmada via webhook.
2. **Taxas de Conversão do Funil:** Visitante → Lead (Capture) → Initiate Checkout → Purchase.
3. **Distribuição de Gateway:** Volume transacionado via PIX vs. Credit Card.
4. **Split Analítico:** Faturamento Bruto vs. Líquido Retido pelos parceiros/taxas da Asaas.

---

## ⚡ Materialized Views e Cache

Consultar toda a tabela `events` (milhares de rows/mês) junto da tabela `purchases` para montar o funil derruba o banco em longos períodos.

**Solução Adotada (Performance SQL):**
Criamos **Materialized Views** que sumarizam as transações diariamente.
Um Cron Job do PostgreSQL (`pg_cron`) roda a cada hora durante o dia efetuando:
`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_summary;`

Quando o administrador acessa o Dashboard, o backend só lê a tabela sumarizada, resultando em latência quase zero (<10ms).

---

## ⚠️ Riscos e Futuro

- **Riscos de Expansão:** Com o acúmulo de dados ano a ano, o cálculo das UTMs na tabela `sessions` e `attribution` pode exigir partições mensais nativas do Postgres.
- **Exportações C-Level:** Futuramente, planeja-se integrar Edge Functions para disparar relatórios (PDF/CSV) automatizados para o e-mail dos gestores ao fim de todo dia (End-of-Day Report).

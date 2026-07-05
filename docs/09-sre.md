---
title: "Site Reliability Engineering (SRE)"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "SRE e Operações"
status: "Estável"
---

# 09. Site Reliability Engineering (SRE)

## 📌 Índice
1. [Conceitos Base de Resiliência](#conceitos-base-de-resiliência)
2. [Correlation ID](#correlation-id)
3. [Idempotência em Webhooks](#idempotência-em-webhooks)
4. [Dead Letter Queue (DLQ) e Retry](#dead-letter-queue-dlq-e-retry)
5. [Monitoramento e Health Checks](#monitoramento-e-health-checks)

---

## 🎯 Conceitos Base de Resiliência

Um SaaS voltado para tráfego em grande escala precisa aguentar surtos de acesso sem corromper transações.
Problemas comuns como perdas de pacotes do Asaas, falhas no banco temporárias, ou duplicação de requests são tratados via Padrões de Confiabilidade Injetados na raiz do banco e nas funções.

---

## 🔍 Correlation ID

Todo o log distribuído exige uma forma de rastreabilidade transversal.
- Assim que o visitante acessa o app, o `tracking.js` gera um UUID e grava no session storage: `nexus_correlation_id`.
- Este ID acompanha a criação de sessão (capture-lead) e a intent de pagamento (create-payment).
- Se houver uma falha interna na Supabase (visível no Edge Log Explorer), podemos filtrar o erro inteiro buscando esse exato UUID, observando o que originou do frontend até a última trigger SQL.

---

## ⚖️ Idempotência em Webhooks

O gateway de pagamento pode sofrer "Spikes" e disparar a mesma aprovação de PIX 5 vezes.
- **Implementação:** Toda vez que a rota `asaas-webhook` processa o fluxo de aprovação com sucesso, ela guarda o ID do evento Asaas (ex: `evt_58832x1...`) na tabela `webhook_idempotency` associada com um Unique Constraint Constraint Indexing.
- Se o evento vier de novo, a inserção irá colidir em Duplicate Key Error, ativando um Handler silencioso na Edge Function que apenas devolve `200 OK` (avisando ao Asaas para não encher mais o saco) sem executar novamente a liberação da licença.

---

## 📬 Dead Letter Queue (DLQ) e Retry

Se um webhook chega no exato milissegundo em que o Supabase PostgreSQL atinge o limite de conexões (`Max Connections Exceeded` - Erro 503 local), o webhook não pode ser ignorado e nem processado.

- **Fluxo SRE:**
  - O Handler envia a requisição pro final da fila local, salvando em `dead_letter_queue` com o payload exato, data, erro que ocasionou a falha, e status "pending".
  - Um Cron job/Automator do Supabase roda periodicamente consumindo o que está Pending e invocando uma re-tentativa orgânica interna via Service Role (simulando a requisição).
  - Após 5 retries, cai em 'failed_permanently' e um alerta silencioso deve acionar a gerência.

---

## 🩺 Monitoramento e Health Checks

1. **Dashboard Logs:** Monitoramento via GUI nativo no Supabase.
2. **Ping no Supabase API:** Endpoints anônimos (ex: um GET simples na rota de health) podem ser conectados a ferramentas como UptimeRobot.
3. **Anomalia de Conversão:** O Dashboard executivo atua como health check de negócio. Se o tráfego da LP for >1.000 users/hora e as conversões chegarem a ZERO absoluta, trata-se de um Incidente Grave.

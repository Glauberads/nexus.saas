---
title: "Roadmap e Status"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Arquitetura e Engenharia"
status: "Atualizado"
---

# 13. Roadmap do Sistema

## 📌 Índice
1. [Concluído](#concluído)
2. [Em Produção (MVP + Scaling)](#em-produção-mvp--scaling)
3. [Em Evolução](#em-evolução)
4. [Planejado (Curto Prazo)](#planejado-curto-prazo)
5. [Longo Prazo](#longo-prazo)

---

## ✅ Concluído

- **Infraestrutura BaaS:** Setup do Supabase, Banco PostgreSQL estruturado.
- **Frontend Core:** Landing Page 100% responsiva (Vanilla HTML/CSS/JS) para máxima performance (LCP baixo).
- **Hardening Fase 1 a 4:** Configurações profundas de RLS (Row Level Security), Rate Limit, restrição de domínios CORS, Security Definer em RPCs e Proteção de PII (Hashing).
- **Checkout Engine:** Integração Server-side direta com a API V3 do Asaas escondendo credenciais na Edge.

## 🚀 Em Produção (MVP + Scaling)

- **Tracking Avançado:** `tracking.js` atuando com Lead Scoring dinâmico e UTM persistence. Disparo Server Side via `capi-relay` mitigando falhas do iOS14.
- **Automações Internas (Webhooks):** Garantia de entrega (Idempotência via `event_id` único no banco) na Edge `asaas-webhook`.
- **Acesso de Usuário:** Tabelas `members` e `member_products` respondendo em tempo real ao status de pagamentos.

## 🏗 Em Evolução

- **Módulo Split Financeiro:** Estrutura já desenhada (`2026_06_16_gateway_module.sql`) e fluxos mapeados, mas o split (rateio transparente) para múltiplos recebedores depende de ajustes nas regras de Wallet ID.
- **Dead Letter Queue (DLQ):** Retries de webhooks que falham já vão para a tabela DLQ, porém a trigger de retry automático via cron ainda está em fase de refinamento.

## 📅 Planejado (Curto Prazo)

- **LMS (Área de Membros EAD):** Evoluir o "Cliente Dashboard" estático para uma área de membros modularizada onde os sistemas comprados estarão disponíveis com progresso e videoaulas de setup integradas.
- **Integração N8N:** Ativar massivamente a função `automation-dispatcher` para conectar o NexusSaaS a qualquer ecossistema CRM externo sem custo via webhooks (zapier-killer).
- **Analytics Reports:** Exportação de CSV/PDF direto do Dashboard Executivo (`get_executive_metrics`).

## 🔭 Longo Prazo

- **Multi-Gateway Orquestrado:** Ligar nativamente Stripe e MercadoPago como Fallback do Asaas. Se Asaas der Timeout, a Edge Function `asaas-create-payment` evolui para `gateway-router` e tenta aprovar no próximo parceiro.
- **IA Lead Scoring GenAI:** Implementar um LLM pequeno na Edge para analisar as respostas do formulário e gerar notas preditivas de fechamento, substituindo a regra fixa de pontos estáticos.

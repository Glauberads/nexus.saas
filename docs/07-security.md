---
title: "Segurança e Hardening"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Arquitetura e Segurança"
status: "Estável"
---

# 07. Segurança e Hardening

## 📌 Índice
1. [Row Level Security (RLS)](#row-level-security-rls)
2. [Gestão JWT e Admin](#gestão-jwt-e-admin)
3. [Rate Limiting (Supabase)](#rate-limiting-supabase)
4. [Conformidade LGPD (Mascaramento)](#conformidade-lgpd-mascaramento)
5. [CORS e Headers](#cors-e-headers)

---

## 🔒 Row Level Security (RLS)

Todas as tabelas do PostgreSQL no NexusSaaS têm o RLS habilitado, garantindo uma abordagem *Default-Deny* (Zero Trust).
- `ENABLE ROW LEVEL SECURITY;`
- **Operação de Inserção Anon:** Usuários do frontend com chave `anon` só possuem policies ativas para Inserção (Insert Only) em eventos e sessões, e jamais para leitura dessas tabelas globais.
- **Leitura do Cliente:** Na tabela `member_products`, a Policy impõe que `member_id` seja idêntico ao extraído no ID do `auth.jwt()`. Usuário não vê produto de terceiro.

---

## 🔑 Gestão JWT e Admin

O Auth do Supabase provê tokens JWT. Para conceder acessos privilegiados aos dashboards, utilizamos um conceito de *Claim validation*:
O banco de dados checa se o e-mail presente no payload JWT descriptografado reside na tabela estrita de administradores ou na role de admin estática.
Exemplo: `USING (auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com')`.

*(Em evolução: Migração para verificação em tabela `admin_users` via JWT claims personalizados para remover hardcoded policies).*

---

## 🛡 Rate Limiting (Supabase)

Para frear Carding Attacks (bots testando cartões de crédito via API de checkout), a infraestrutura emprega:
- Módulo Supabase Rate Limit (Rack-level no API Gateway).
- Na camada lógica (Edge Function `asaas-create-payment`), implementamos um cooldown cache utilizando memcached ou checks em tabela de `rate_limits` vinculados por IP / Sessão. (Fase SRE Reliability).

---

## ⚖️ Conformidade LGPD (Mascaramento)

Em respeito às regulamentações, dados que trafegam ou repousam:
- **Client to Edge:** Payloads de cartão de crédito não repousam, sequer nas `webhook_logs`. Eles são omitidos e apenas os 4 últimos dígitos (`**** 1234`) são gravados se estritamente necessário no payload de falha.
- **Server to Meta:** Dados de contatos diretos (email, telefone) sofrem Hash em SHA-256 no client side ou Edge antes de serem mandados pelo CAPI. Não traficamos E-mail em plain-text para a Graph API.

---

## 🌐 CORS e Headers

Todas as requisições das Edge Functions utilizam pre-flight checks (`OPTIONS`) rigorosos, respondendo exclusivamente para os domínios mapeados em variável de ambiente. Domínios externos que tentem dar POST para `capture-lead` recebem rejeição imediata, salvaguardando nosso limite de uso do banco.

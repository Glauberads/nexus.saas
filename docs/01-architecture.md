---
title: "Arquitetura do NexusSaaS"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Arquitetura e Engenharia"
status: "Estável"
related_files:
  - "../NEXUSSAAS_CONTEXT.md"
  - "02-database.md"
  - "03-edge-functions.md"
---

# 01. Arquitetura do Sistema

## 📌 Índice
1. [Objetivo e Responsabilidade](#objetivo-e-responsabilidade)
2. [Arquitetura Geral](#arquitetura-geral)
3. [Fluxo de Dados e Integração](#fluxo-de-dados-e-integração)
4. [Fluxo Financeiro](#fluxo-financeiro)
5. [Riscos e Melhorias Futuras](#riscos-e-melhorias-futuras)

---

## 🎯 Objetivo e Responsabilidade
O objetivo deste documento é mapear os principais componentes do NexusSaaS e mostrar como as peças conversam entre si. A responsabilidade da arquitetura desenhada aqui é assegurar **resiliência, escalabilidade barata e velocidade extrema** no tempo de carregamento da página final (LCP/FCP) para otimizar as métricas de tráfego pago (CAC).

---

## 🏛 Arquitetura Geral

O NexusSaaS foi particionado em um modelo híbrido de **Jamstack estático** + **Backend as a Service (BaaS)**.

- **Camada de Apresentação (Frontend):** 
  - Puramente arquivos HTML/CSS/JS (Vanilla).
  - Pode ser servido via Cloudflare Pages, AWS S3, ou Vercel. Cacheado 100% na borda (Edge).
- **Camada Lógica (Middleware/Edge Functions):**
  - Deno Functions hospedadas pelo Supabase. Atuam como proxies seguros, validando dados sensíveis antes de encostar no banco ou em parceiros financeiros (Asaas, Meta).
- **Camada de Dados (PostgreSQL):**
  - Gerenciado pelo Supabase. Modelagem fortemente tipada, com Triggers, Functions (RPCs) e Row Level Security garantindo proteção contra invasões pelo lado do cliente.

### Diagrama de Arquitetura Macro

```mermaid
graph TD
    subgraph Frontend [Camada de Apresentação - Edge/CDN]
        LP(Landing Page)
        CHK(Checkout Page)
        DASH_C(Dashboard Cliente)
        DASH_A(Dashboard Admin)
    end

    subgraph Tracking [Tracking Engine]
        GTM(Google Tag Manager)
        PIXEL(Meta Pixel)
        GA(GA4)
    end

    subgraph Middleware [Camada Lógica - Edge Functions]
        EF_CAP(Capture Lead)
        EF_PAY(Asaas Create Payment)
        EF_WH(Asaas Webhook)
        EF_CAPI(CAPI Relay)
    end

    subgraph Database [Camada de Dados - Supabase / PostgreSQL]
        DB_L(Leads & Sessions)
        DB_P(Purchases & Gateway)
        DB_M(Members & Access)
        RPC(Stored Procedures / RPCs)
    end

    subgraph APIs [APIs de Terceiros]
        ASAAS(Gateway Asaas)
        FB(Facebook API)
    end

    LP -->|1. Navegação & Eventos| Tracking
    LP -->|2. Captura UTMs/Dados| EF_CAP
    CHK -->|3. Submete Pagamento| EF_PAY
    DASH_C -->|Consulta Acesso via JWT| DB_M
    DASH_A -->|Consulta Dashboards via RPC| RPC

    Tracking -.->|Tags Client Side| GTM
    GTM -.->|Envia Conversões| PIXEL
    GTM -.->|Envia Métricas| GA

    EF_CAP -->|Grava Sessão| DB_L
    EF_PAY -->|Requisição Server-to-Server| ASAAS
    ASAAS -->|Notificação de Pgto| EF_WH
    EF_WH -->|Confirma e Libera Acesso| DB_P
    EF_WH -->|Libera| DB_M

    EF_CAPI -->|Server-Side Events| FB
```

---

## 🔄 Fluxo de Dados e Integração

A entrada de dados ocorre exclusivamente pelo Frontend e webhooks, garantindo um funil fechado:

1. **Entrada de Visitante:** O `tracking.js` inicializa, capta UTMs da URL e instancia um `correlation_id` (session storage).
2. **Registro Anônimo:** A função `capture-lead` gera a linha na tabela `sessions`.
3. **Engajamento:** Scores de engajamento (scroll, cliques) aumentam o Lead Score, salvando no `localStorage` e refletindo em chamadas pontuais (debounced) pro banco.
4. **Checkout:** Ao preencher o email, um pré-lead é criado. Submetendo os dados financeiros, o payload (com hash de PII para CAPI) é despachado para a Edge Function `asaas-create-payment`.

### Diagrama de Sequência do Lead

```mermaid
sequenceDiagram
    participant User as Visitante
    participant UI as Frontend
    participant Trk as Tracking (JS)
    participant Edge as Supabase Edge Func
    participant DB as PostgreSQL

    User->>UI: Acessa Landing Page
    UI->>Trk: Identifica UTMs
    Trk->>Edge: POST /capture-lead (Init Session)
    Edge->>DB: INSERT sessions
    Edge-->>Trk: retorna session_token
    
    User->>UI: Interage (Assiste VSL)
    Trk->>Trk: Incrementa Lead Score
    
    User->>UI: Preenche formulário e Checkout
    UI->>Edge: POST /capture-lead (Lead Capturado)
    Edge->>DB: INSERT/UPDATE leads
```

---

## 💸 Fluxo Financeiro

O fluxo de processamento de pagamentos prioriza segurança (PCI-DSS delegada) e confiabilidade matemática (Idempotência).

1. O client **jamais** faz chamadas diretas ao Asaas. Ele envia os dados (CPF, Cartão) criptografados por SSL para a `asaas-create-payment`.
2. A Edge Function recebe, mascara os logs do cartão, cria o customer no Asaas, cria a cobrança, salva o ID no Supabase (`payment_attempts` e `asaas_payments`) e retorna o status (ou PIX Copy/Paste).
3. O client inicia um Polling (a cada 5s) via RPC `get_checkout_status` aguardando a confirmação real.
4. O Asaas envia o Webhook de aprovação. A função `asaas-webhook` retém o log, garante que não seja duplicação e altera a flag `access_granted = true`.
5. O Polling do frontend detecta o update e joga o usuário na tela de Obrigado / Upsell.

---

## ⚠️ Riscos e Melhorias Futuras

### Riscos Conhecidos
- **Single Point of Failure em Gateways:** Se o Asaas sofrer indisponibilidade, todo o funil converte em falha, visto que é o único meio implementado.
- **Payload Exposure:** Mesmo com HTTPS, dados de cartão trafegam da máquina cliente para a Edge Function do Supabase. A Edge Function não os armazena, mas a memória temporária da Edge deve ser observada rigorosamente para que exceptions não printem os dígitos integrais em logs corporativos.

### Melhorias Futuras (Roadmap Arquitetural)
- **Roteador de Gateways (Fallbacks):** Arquitetar o `gateway_module` para tentar cobrar via Stripe se o Asaas recusar a transação por anti-fraude genérico.
- **Cache Centralizado (Redis):** Substituir as queries de polling por um Pub/Sub real-time (Supabase Realtime) via WebSockets para evitar peso na CPU do Postgres durante picos de checkouts.

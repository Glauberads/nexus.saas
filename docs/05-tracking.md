---
title: "Motor de Rastreamento (Tracking)"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Arquitetura e Engenharia"
status: "Estável"
related_files:
  - "05-tracking.md"
---

# 05. Motor de Rastreamento e Conversão

## 📌 Índice
1. [Objetivo e Arquitetura](#objetivo-e-arquitetura)
2. [O Arquivo `tracking.js`](#o-arquivo-trackingjs)
3. [Componentes Principais](#componentes-principais)
4. [Eventos Mapeados](#eventos-mapeados)
5. [Lead Scoring Dinâmico](#lead-scoring-dinâmico)

---

## 🎯 Objetivo e Arquitetura
A inteligência do negócio mora no rastreamento. Para reduzir CAC e alimentar os algoritmos do Google/Meta, construímos uma engine Vanilla JS assíncrona. Ela orquestra as interações e unifica o push de dados para todas as plataformas de anúncios de modo coerente (evitando que o Pixel atire um valor e o Google Analytics outro).

**Fonte única da verdade (Datalayer):** O evento no frontend sempre vai primeiramente para o `dataLayer` e para a classe interna do `NexusTracker`.

---

## 🧠 O Arquivo `tracking.js`

Um singleton altamente performático inicializado no DOMContentLoaded.
- **Responsabilidade:** Persistir UTMs, medir engajamento, instanciar a sessão anônima, fazer cache local do Lead Score, disparar GTM e chamar a Edge Function de Server Side Tracking (CAPI).
- **Sem dependências pesadas:** Código em JS Vanilla para carregar antes do GTM.

---

## 🧩 Componentes Principais

### UTM Persistence Engine
Capta todas as `utm_*` da query string e as grava no `localStorage` e cookies (validade de 90 dias).
Em todas as chamadas de conversões futuras, as UTMs originais são anexadas ao payload para garantir Atribuição e First-Click Tracking.

### CAPI Relay (Meta)
Quando um evento valioso ocorre (ex: `InitiateCheckout`), o JS envia o payload pro Meta Pixel, mas também faz um POST para a Edge Function `capi-relay`. O backend trata de anonimizar em SHA-256 (e-mail, phone) e repassa via token Graph API para burlar AdBlockers e IOS 14 restrictions.

### Integração GTM & GA4
Todos os disparos (PageView, Custom Events) rodam `window.dataLayer.push({ event: 'event_name', ...params })`. As triggers do GTM são configuradas para escutar os nomes exatos. O GTM resolve a tag do Google Ads, dispensando gtag nativo no código limpo.

---

## 📡 Eventos Mapeados

| Evento Nexus | Destino GTM / GA4 | Ação/Gatilho |
|-------------|-------------------|---------------|
| `PageView` | `page_view` | Carga inicial da tela. |
| `ViewContent` | `view_item` | Carga do VSL/Oferta. |
| `Lead` | `generate_lead` | E-mail capturado (Form ou Checkout). |
| `InitiateCheckout`| `begin_checkout` | Botão de Compra Clicado. |
| `Purchase` | `purchase` | Webhook aprovado/Tela Obrigado. |
| `Scroll50` | `scroll_depth` | Visibilidade vertical >= 50%. |
| `Time60s` | `timer` | 60 segundos retidos na tela. |
| `VideoComplete` | `video_complete` | Youtube/Vimeo Iframes finalizados. |

---

## 🌡 Lead Scoring Dinâmico

Cada ação converte pontos e cataloga o Lead em Tiers de qualificação.

**Pontuações Atuais:**
- `Scroll50` = 5pts
- `Time120s` = 20pts
- `ViewPricing` = 20pts
- `VideoComplete` = 30pts
- `InitiateCheckout` = 50pts

**Tiers de Temperatura:**
- 0-25: Frio
- 26-50: Morno
- 51-75: Quente (Dispara tag invisível `QualifiedLead` no GA4).
- 76+: Muito Quente (Dispara `ReadyToBuy` permitindo Remarketing agressivo apenas aos >76pts).

# Contexto Oficial: NexusSaaS

> **NOTA DE SEGURANÇA:** Este documento descreve a arquitetura e fluxos do sistema. Por razões de segurança, senhas, tokens reais, DSNs, chaves privadas, credenciais, URIs de banco e endpoints internos sensíveis não estão expostos aqui. Suas configurações residem no `.env` e Supabase Vault.

## 1. Visão Geral

- **Objetivo do projeto:** Disponibilizar uma plataforma (Marketplace/SaaS) para venda de sistemas prontos (White-Label) focados em empreendedores, agências e gestores de tráfego.
- **Público-alvo:** Agências Digitais, Gestores de Tráfego, Infoprodutores, Afiliados e Freelancers.
- **Problema que resolve:** O alto custo e tempo de desenvolvimento (meses) para lançar um produto digital ou SaaS do zero.
- **Diferenciais:** Lead Score dinâmico, Tracking robusto (Meta Pixel + CAPI + GA4 integrado via dataLayer), Split Financeiro integrado, alta performance e esteira pronta.
- **Arquitetura geral:** Arquitetura Serverless (BaaS) baseada no **Supabase** (PostgreSQL + Auth + Edge Functions) no backend e HTML/CSS/JS (Vanilla) puro no frontend visando ultra-velocidade e fácil personalização sem build steps complexos.

---

## 2. Arquitetura Frontend

A aplicação é dividida em pequenas "aplicações de página única" baseadas em arquivos `.html` estáticos e scripts específicos.

- **Landing (`index.html` & `script.js`):**
  - **Objetivo:** Capturar leads e converter visitantes em compradores de forma rápida.
  - **Responsabilidade:** Renderizar a oferta principal (VSL, benefícios, provas) e acionar o pixel de rastreamento avançado.
  - **Fluxo:** Exibe popups de lead magnet, captura de lead offline e direciona para o checkout.

- **Checkout (`checkout.html` & `checkout-app.js`):**
  - **Objetivo:** Processar o pagamento final.
  - **Responsabilidade:** Mostrar resumo do produto, opções de pagamento (Pix, Cartão, Boleto) integrando com Edge Functions para evitar exposição de chaves do Asaas no client.
  - **Fluxo:** Inicializa uma sessão anônima → Associa lead capturado → Chama `asaas-create-payment` → Mostra PIX Copia e Cola / URL Boleto ou redireciona pro sucesso.

- **Obrigado & Upsell (`obrigado.html`, `upsell.html`):**
  - **Objetivo:** Pós-venda e aumento de LTV (Esteira de Produtos).
  - **Responsabilidade:** Confirmar a compra e oferecer upgrades.

- **Área Cliente (`cliente-login.html`, `cliente-dashboard.html`, `cliente-app.js`):**
  - **Objetivo:** Entrega do produto digital.
  - **Responsabilidade:** Gerir licenças, downloads e acessos baseados na verificação do pagamento no banco (`member_products`).

- **Área Admin (`admin-login.html`, `admin-dashboard.html`, `admin-app.js`, `admin-fin-logs.js`):**
  - **Objetivo:** Backoffice executivo.
  - **Responsabilidade:** Monitoramento de saúde financeira, logs de webhook, CRM básico e gestão de usuários (utiliza role base RLS e JWT).

---

## 3. Arquitetura Backend (Edge Functions)

O backend lógico reside em Deno Edge Functions no Supabase.

### `abandonment-recovery`
- **Objetivo:** Acionar automações de recuperação de carrinho.
- **Fluxo:** Lê sessions/leads sem compras e envia evento para N8N/Webhook.
- **Autenticação:** Chamada por CRON interno (PgBouncer/pg_cron) ou RPC autenticado.

### `ads-sync`
- **Objetivo:** Conversões Offline para Google Ads.
- **Responsabilidade:** Disparar `gclid` e eventos de conversão no formato do Google Ads API.

### `asaas-create-payment`
- **Objetivo:** Comunicar com Asaas para gerar cobranças sem expor a API Key.
- **Entrada:** `lead_id`, `product_slug`, dados do pagador, cartão.
- **Saída:** ID da transação e código PIX/Boleto.
- **Integração:** Asaas API. Tratamento de erro detalhado para recusas de cartão.

### `asaas-webhook`
- **Objetivo:** Receber status de pagamento do Asaas.
- **Validações:** Validação de payload e idempotência (evitar dupla cobrança/liberação).
- **Relação:** Grava logs em `webhook_logs`, `asaas_payments` e libera acesso na tabela `member_products`.

### `automation-dispatcher`
- **Objetivo:** Orquestrar integrações externas (ex. N8N, Zapier).

### `capi-relay`
- **Objetivo:** Conversions API do Meta. Recebe eventos do Client, faz hash PII e envia pro FB via servidor.
- **Segurança:** Requer chave pública Supabase e valida origens (CORS).

### `capture-lead`
- **Objetivo:** Criar e atualizar sessões e leads durante o checkout e optin.

### `crm-inbound`
- **Objetivo:** Processamento de webhook de WhatsApp CRM.

### `gateway-settings` & `gateway-test`
- **Objetivo:** Gerenciar as credenciais Multi-Gateway no Supabase Vault.

### `purchase-webhook`
- **Objetivo:** Processar o fluxo lógico de uma compra finalizada (distribuindo permissões de acesso).

---

## 4. Banco de Dados (Supabase / PostgreSQL)

O modelo é altamente relacional e segmentado em módulos.

### Módulo de Leads & Tracking (schema.sql)
- **`leads`:** Armazena dados de contato e UTMs. Possui `lead_score` e hash SHA-256 (PII).
- **`sessions`:** Sessões do usuário.
- **`events`:** Log de eventos (PageView, InitiateCheckout).
- **`lead_journey`:** Linha do tempo de ações.
- **`attribution`:** Multi-touch (First-touch/Last-touch UTMs).

### Módulo Multi-Gateway (2026_06_16_gateway_module.sql)
- **`payment_gateways`:** Configurações (Asaas etc).
- **`gateway_events`:** Eventos com suporte a **Idempotência**.
- **`payment_attempts`:** Log de recusas e tentativas.
- **`asaas_customers` / `asaas_payments`:** Tabelas específicas para IDs do gateway Asaas.
- **`subscriptions` / `refunds`:** Assinaturas recorrentes e reembolsos.
- **Triggers:** Revogação automática de acesso no refund (`handle_access_revocation()`).

### Módulo SRE e Logs
- **`webhook_idempotency`:** Previne processamento duplo de eventos de pagamentos.
- **`dead_letter_queue`:** Mensagens que falharam X vezes ficam retidas para análise manual.
- **`webhook_logs`:** Log raw de todo webhook recebido.
- **`financial_logs`:** Histórico consolidado para auditoria de pagamentos.

### Módulo Segurança (Hardening)
- **`admin_users`:** Lista estrita de e-mails admins.
- **`rate_limits`:** Bloqueio de abuso em endpoints.

---

## 5. Sistema Financeiro

- **Gateway Asaas:** Principal e nativo (PIX dinâmico, Cartão Transparente, Boleto).
- **Webhook e Liberação:** Recebe `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`. Valida valor, idempotência, associa compra em `purchases`, e dá update no boolean `access_granted` na `member_products`.
- **Split:** Permite divisão de receitas configurável por produto (útil para afiliados / co-produção).
- **Upsell (One-Click-Buy):** Fluxo para cobrar em cima do mesmo customer_id sem redigitar cartão (onde o gateway suportar).

---

## 6. Tracking (tracking.js)

O motor central (`tracking.js`) é altamente sofisticado.
- **Objetivo:** Rastreamento unificado sem perdas.
- **Eventos:** PageView, ViewContent, InitiateCheckout, Purchase, Scroll, Time, FAQInteraction.
- **UTMs:** Persistidas via Cookie e LocalStorage por 30-90 dias. Fbc e Fbp salvos.
- **Lead Score:** Sistema dinâmico (ex: Scroll50 = 5 pts, InitiateCheckout = 50 pts). Define tiers (Frio, Morno, Quente, Muito Quente).
- **DataLayer:** Todos os eventos essenciais disparam push para o `dataLayer` do Google Tag Manager.
- **GTM (Google Tag Manager):** Orquestra Google Ads e GA4 lendo do dataLayer.
- **Meta Pixel + CAPI:** Eventos enviados via browser (Pixel) e espelhados pelo servidor (`capi-relay`).

---

## 7. Analytics Executivo

- **Dashboard:** HTML customizado (`admin-dashboard.html`) que consome dados via RPCs PostgreSQL do Supabase.
- **KPIs:** MRR, Vendas no Dia, Taxa de Conversão de Cartão, Taxa de Conversão PIX, LTV, Split distribuído.
- **Chart.js:** Gráficos no frontend atualizados em tempo real.
- **Cache:** Utilização de Materialized Views no banco para otimizar queries pesadas do dashboard.

---

## 8. Segurança (Hardening e RLS)

- **RLS (Row Level Security):** Ativo em 100% das tabelas. Usuários anônimos podem apenas INSERIR em eventos ou sessões via chaves anônimas. Leitura do admin restrita ao token JWT contendo a role de administrador (`auth.jwt() ->> 'email' = '...'`).
- **RPCs Seguras:** As consultas complexas e liberação de sessão ocorrem através de stored procedures (RPCs) rodando como `SECURITY DEFINER` protegidas.
- **Sanitização:** CAPI e banco fazem hash de PII (SHA-256 de e-mail e celular) por conta da LGPD.

---

## 9. Sprint SRE

- **Correlation ID:** IDs rastreáveis gerados no frontend, passados para a API e retidos nos logs para debug cross-service.
- **Idempotency:** Webhooks repetidos do Asaas são ignorados após o primeiro `processed`.
- **DLQ (Dead Letter Queue):** Falhas em webhooks (ex: erro 500 em trigger) são movidas para DLQ para retry posterior.
- **Monitoramento:** Tabela `financial_logs` capta qualquer divergência no balanço de Split.

---

## 10. Fluxos Completos do Sistema

### Fluxo de Pagamento (Ponta a Ponta)
1. **Visitante** entra na Landing Page e recebe Cookies/Local Storage de UTMs e `correlation_id`.
2. **Tracking** começa a logar Scorings (scroll, clicks).
3. **Lead** baixa o lead magnet (optin) ou vai pro checkout.
4. **Checkout** recebe o ID do lead. Frontend chama a edge function `asaas-create-payment`.
5. **Pagamento** gerado no Asaas via API. Cliente recebe PIX na tela.
6. **Webhook** asaas dispara um POST pro Supabase `asaas-webhook`.
7. **Webhook handler** insere no `webhook_logs`, checa idempotência, localiza usuário.
8. **Liberação**: Edge Function cria o registro em `purchases` e `member_products` (Acesso Liberado).
9. **Analytics**: Transação salva e atualiza Materialized Views. Dashboard Admin atualizado.

---

## 11. Estrutura do Projeto

```
/
├── index.html            # Landing page principal
├── checkout.html         # Página de checkout
├── obrigado.html         # Sucesso da compra
├── upsell.html           # Oferta OTO (One Time Offer)
├── admin-*.html          # Área administrativa (login, dashboard)
├── cliente-*.html        # Área do cliente membro
├── *.js                  # Scripts frontend (tracking.js, app.js, supabase-client.js)
├── styles.css            # Folha de estilo Vanilla principal
├── sql/                  # Migrations e scripts DDL do Supabase
│   ├── schema.sql        # Schema core
│   └── *_module.sql      # Módulos específicos e Hardening
└── supabase/
    └── functions/        # Edge Functions Typescript/Deno
```

---

## 12. Dependências

- **Supabase JS:** SDK para comunicação Client-Database/Edge.
- **Asaas API:** Gateway Financeiro.
- **Meta Pixel / CAPI / GTM / GA4:** Ecossistema de traqueamento e marketing.
- **Chart.js:** Renderização de gráficos no painel Admin (Carregado via CDN).

---

## 13. Mapa de Dependências (Módulos)

```text
Landing Page
 ├── Tracking Engine (tracking.js)
 │    ├── CAPI Relay (Edge Function)
 │    └── Eventos Supabase (DB: events)
 ├── Capture Lead (Edge Function)
 │    └── DB: leads, sessions
 └── Checkout Page
      ├── Asaas Create Payment (Edge Function)
      │    └── DB: payment_attempts, asaas_payments
      ├── Asaas Webhook (Edge Function)
      │    ├── DB: webhook_idempotency
      │    ├── DB: purchases
      │    ├── DB: asaas_payments
      │    └── DB: member_products (Liberação)
      └── Área do Cliente (Dashboard)
           └── DB: member_products (Verificação JWT RLS)
```

---

## 14. Variáveis de Ambiente

As variáveis (injetadas no Supabase e no arquivo config frontend) gerenciam:
- **Frontend / Supabase:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- **Backend Edge Functions:** `SUPABASE_SERVICE_ROLE_KEY` (Root access), `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `META_CAPI_TOKEN`, `META_PIXEL_ID`.
- Nenhuma variável real deve ser commitada em repositórios.

---

## 15. Estado Atual da Plataforma

- **Módulos Concluídos e Estáveis:**
  - Tracking Avançado (Meta, CAPI, UTMs).
  - CRM Simplificado e Lead Scoring (com Refresh Dinâmico).
  - Checkout Transparente c/ Integração Asaas.
  - Hardening RLS (Fase 1, 3 e 4 completadas no DB).
  - Operations Center V3 (Live Analytics em tempo real c/ Missão Crítica).
  - SEO Completo (OG Image, Twitter Cards, Web Manifest e Favicons).
- **Módulos em Evolução (Experimentais/Aprimoramento):**
  - Split Financeiro (Logs já criados, mas orquestração complexa com afiliados ainda em testes).
  - Dead Letter Queue e Retries de webhooks (Módulo recém introduzido no `sre_reliability.sql`).
- **Planejado (Roadmap):**
  - Integração Multi-Gateway real (Stripe/MercadoPago além do Asaas).
  - Área do Cliente com progressão de curso (LMS).

---

## 16. Guia para Desenvolvedores

**Como Iniciar:**
1. Clone o repositório.
2. Como não há bundler (React/Vue), rode um servidor local simples (ex: `npx serve` ou Live Server do VSCode).
3. As Edge Functions do Supabase podem ser rodadas localmente usando `supabase start` (requer CLI instalada) e `supabase functions serve`.
4. Os scripts SQL devem ser rodados em ordem sequencial no SQL Editor do Supabase se for um projeto novo.

**Padrões e Convenções:**
- **Lógica e API:** Toda lógica de negócios complexa deve ser movida para **Edge Functions**. O Client-side não deve fazer chamadas DB pesadas.
- **Hardening:** Toda nova tabela DEVE ter `RLS` habilitado. `ENABLE ROW LEVEL SECURITY`. Nunca crie policies `FOR ALL USING (true)`.
- **Arquitetura de Tracking:** Não utilize comandos de Pixel hardcoded em botões. Toda interação deve chamar `window.NexusTracker.track()` que centraliza a distribuição de eventos de modo unificado.

---

## 17. Análise Crítica e Decisões Arquiteturais

### Decisões Adotadas:
1. **Vanilla JS no Front / Supabase no Back:** Removeu a complexidade do React/Next.js focando em velocidade máxima de carregamento de LPs. 
2. **GTM como Orquestrador de Google Ads:** Optou-se por focar o Meta API nativo (`capi-relay`), mas manter os disparos do Google encapsulados no DataLayer, provendo flexibilidade ao time de marketing.
3. **Idempotência no Banco:** Adição do `event_id` como UNIQUE constraint no banco e nas views de webhook garantem segurança matemática contra race-conditions (problema muito comum em gateways rápidos como o Pix).

### Riscos e Dívida Técnica:
- **Segurança de Checkout (Risco Baixo):** O payload do cartão é enviado à Edge function. Assegure que as páginas sempre rodem em ambiente restrito HTTPS. O PCI Compliance recai sobre como a Edge repassa a chave para o Asaas (os logs NÃO devem salvar o número do cartão inteiro sob nenhuma hipótese).
- **Complexidade do `tracking.js` (Oportunidade):** Atualmente arquivo massivo. Seria interessante modularizar se o projeto crescer mais.
- **Hard-coded Admin:** A validação de administrador atual está "chumbada" na trigger/policy RLS checando o e-mail (`auth.jwt() ->> 'email' = 'suporteglauberr@gmail.com'`). **Recomendação:** Migrar para tabela de roles ou claim customizado no JWT.

Este documento reflete a base consolidada e deve ser consultado e atualizado a cada nova Sprint SRE, adição de gateway, ou mudança estrutural no motor de Tracking.

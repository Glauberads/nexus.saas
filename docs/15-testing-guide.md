---
title: "Guia de Testes (Testing Guide)"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "QA e Engenharia"
status: "Estável"
---

# 15. Guia de Testes

## 📌 Índice
1. [Testes Manuais Core](#testes-manuais-core)
2. [Validação de Tracking e CAPI](#validação-de-tracking-e-capi)
3. [Validação de Webhooks e Pagamentos](#validação-de-webhooks-e-pagamentos)
4. [Checklist de Deploy e Pós-Deploy](#checklist-de-deploy-e-pós-deploy)

---

## 🧑‍💻 Testes Manuais Core

A estrutura Serverless e Vanilla exige que testes rigorosos manuais sejam efetuados antes de colocar dinheiro em tráfego.

**Fluxo de Teste de Conversão (End-to-End):**
1. Limpe os cookies e LocalStorage (Application tab no DevTools).
2. Adicione UTMs de teste à URL: `?utm_source=test&utm_medium=qa`.
3. Navegue pela página para inflar o Lead Score (fique 1 minuto, chegue ao fim do scroll).
4. Clique em "Comprar".
5. Verifique no Console de Redes (Network) se o POST para `capture-lead` obteve status HTTP 200.
6. Na base de dados, confirme que o e-mail surgiu na tabela `leads` com a tag UTM correta.

---

## 📡 Validação de Tracking e CAPI

- **Meta Pixel:** Use o "Facebook Pixel Helper" (Extensão do Chrome). Navegue e valide se "PageView" acendeu. Se houver erro de catálogo, ignore se não estiver usando Ads com DPA.
- **Server Side API:** No Gerenciador de Anúncios do Meta, vá em **Testar Eventos**. Copie o "Test Code" e gere um evento de conversão. Verifique nos logs do Edge (`capi-relay`) se a requisição saiu e se no Gerenciador ela acusou como recebida.
- **Google Tag Manager:** Use o modo **Preview** do GTM. Cumpra os passos da LP. Valide se os objetos injetados no DataLayer estão com `ecommerce.items` preenchido adequadamente.

---

## 💸 Validação de Webhooks e Pagamentos

Para evitar perder dinheiro bloqueado ou testar falhas de anti-fraude:

1. **Ambiente Asaas Sandbox:** Altere a var de ambiente `ASAAS_API_KEY` para o token da conta Sandbox Asaas.
2. Gere um Pix no checkout. Pague usando o botão mágico de "Pagar Fictício" do próprio painel Asaas Sandbox.
3. Observe se a tela de checkout pula para "Obrigado" (Polling via `get_checkout_status` funcionou).
4. **Idempotência:** Pegue o JSON raw recebido no Webhook Log, use o Postman e envie O MESMO webhook novamente para a Edge Function `asaas-webhook`. A resposta deve ser 200, mas a action no log de idempotência não deve se repetir (Duplicate error pego internamente).

---

## 📋 Checklist de Deploy e Pós-Deploy

### Pré-Produção
- [ ] O `tracking.js` está apontando para o Pixel e GTM reais do cliente?
- [ ] As UTMs persistem ao trocar de página no Session Storage/Cookies?
- [ ] `SUPABASE_URL` no `tracking.js` e `checkout-app.js` aponta para Prod?

### Pós-Deploy (Go-Live)
- [ ] A API Key do Asaas de produção foi inserida no Secret Vault.
- [ ] Realize uma compra via PIX real (R$ 1,00 alterando o preço temporariamente) e veja se estorna ou converte.
- [ ] Analise se a Materialized View está programada no pg_cron corretamente (Executar um REFRESH de teste).

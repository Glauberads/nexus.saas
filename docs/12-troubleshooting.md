---
title: "Troubleshooting (Solução de Problemas)"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "SRE e Operações"
status: "Estável"
---

# 12. Troubleshooting (Solução de Problemas)

## 📌 Índice
1. [Pagamento não aprovado / Carrinho abandonado](#pagamento-não-aprovado--carrinho-abandonado)
2. [Webhook Duplicado / Eventos Repetidos](#webhook-duplicado--eventos-repetidos)
3. [Split Financeiro Falhando](#split-financeiro-falhando)
4. [RPC Lenta ou Erro Timeout](#rpc-lenta-ou-erro-timeout)
5. [Erros RLS e Falha de JWT](#erros-rls-e-falha-de-jwt)
6. [Erros GTM, GA4 e Meta CAPI](#erros-gtm-ga4-e-meta-capi)

---

## 🛑 Pagamento não aprovado / Carrinho abandonado

- **Sintoma:** Cliente clica em pagar e retorna erro genérico.
- **Investigação:**
  1. No Supabase, busque a Edge Function `asaas-create-payment` no Log Explorer.
  2. Filtre por `correlation_id` se o cliente reportou o erro.
  3. Verifique a chave de ambiente `ASAAS_API_KEY`. Se estiver em `sandbox`, cartões reais serão recusados.
- **Resolução:** Se a Asaas retornar recusa do emissor (anti-fraude), oriente o cliente a tentar novamente ou gere um PIX manual via Admin.

## 🔄 Webhook Duplicado / Eventos Repetidos

- **Sintoma:** O mesmo acesso foi liberado duas vezes ou o dashboard computou duas vendas.
- **Investigação:** Vá para a tabela `webhook_idempotency`. Verifique se o ID do webhook está salvo.
- **Resolução:** Se a restrição `UNIQUE` da tabela foi removida acidentalmente, o erro vai ocorrer. Recrie a constraint: `ALTER TABLE public.webhook_idempotency ADD CONSTRAINT webhook_id_unique UNIQUE (event_id);`.

## 🪓 Split Financeiro Falhando

- **Sintoma:** O valor chegou no Asaas, mas os comissionados não receberam.
- **Investigação:** Verifique se as carteiras (Wallet IDs) cadastradas no backend estão ativas no Asaas. Se a carteira de um afiliado não concluiu o KYC do Asaas, toda a transação do carrinho pode ser bloqueada.
- **Resolução:** Desabilite temporariamente o split para aquele parceiro (colocando `split_enabled: false` na configuração de produto).

## 🐢 RPC Lenta ou Erro Timeout

- **Sintoma:** Dashboard admin demorando > 5 segundos.
- **Investigação:** Verifique se a Materialized View está sendo alimentada ou se o usuário tentou consultar dados muito massivos (ex: 5 anos de analytics).
- **Resolução:** Force o update: `REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_summary;` no SQL Editor. Verifique se o índice da tabela principal não foi dropado.

## 🔑 Erros RLS e Falha de JWT

- **Sintoma:** Usuário tenta logar no Admin Dashboard, vê painel em branco. No console network aparece HTTP 401 ou `new row violates row level security`.
- **Investigação:** 
  1. O e-mail do admin está na tabela `admin_users`?
  2. A sessão JWT no `localStorage` (`sb-xxxxx-auth-token`) pode ter expirado.
- **Resolução:** Forçar logout e pedir relogin para forjar um novo JWT.

## 👁 Erros GTM, GA4 e Meta CAPI

- **Sintoma:** Conversões não aparecem no Gerenciador de Anúncios.
- **Investigação:**
  - Instale o **Facebook Pixel Helper** na extensão do Chrome. O PageView e InitiateCheckout disparam?
  - Para o CAPI: Verifique nos logs da edge function `capi-relay` se há retorno HTTP 400 do Facebook (normalmente por Token Inválido ou Test Event Code errado).
- **Resolução:** Atualize a `META_CAPI_TOKEN` e reinicie a Edge Function. Se o GTM não captar nada, verifique se o script GTM no `<head>` do `index.html` contém o ID correto da sua conta.

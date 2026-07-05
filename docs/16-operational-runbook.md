---
title: "Runbook Operacional"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "SRE e Operações"
status: "Estável"
related_files:
  - "09-sre.md"
  - "12-troubleshooting.md"
---

# 16. Operational Runbook

Este documento prescreve procedimentos táticos e emergenciais (Disaster Recovery e Incident Response) para mitigar falhas estruturais em produção com o menor downtime possível.

## 📌 Índice
1. [Falhas Críticas de Plataforma](#falhas-críticas-de-plataforma)
2. [Anomalias de Negócio](#anomalias-de-negócio)
3. [Rollback e Recovery](#rollback-e-recovery)

---

## 🚨 Falhas Críticas de Plataforma

### Supabase Indisponível (Outage Total)
- **Sintoma:** Frontend carrega (servido via Cloudflare Edge), mas qualquer tentativa de compra, requisição de preço, login ou capture lead retorna erro CORS ou 502/503.
- **Ação Imediata (Mitigação):**
  1. Direcionar o botão principal da Landing Page via Painel DNS ou GTM para um Checkout Externo Genérico (Ex: Link direto da Kiwify ou Hub) para não perder tráfego pago ativo.
  2. Suspender campanhas do Meta Ads/Google Ads se o tempo de outage reportado na [status.supabase.com](https://status.supabase.com) exceder 1 hora.
- **Recovery:** Assim que o Supabase voltar, puxar os CSVs da contingência (se gerou vendas avulsas) e popular a tabela `purchases` manualmente com script massivo de INSERT.

### Asaas Indisponível (Timeout de Gateway)
- **Sintoma:** Supabase funciona, Lead capturado, mas a requisição na Edge Function `asaas-create-payment` dá Timeout ou Retorna 500 originário da Asaas.
- **Ação Imediata:**
  1. Acessar o Supabase Logs e confirmar a falha "Asaas Connection Refused".
  2. Emitir comunicados e congelar campanhas de conversão fundo de funil.
  3. (Futuro) Modificar a flag de Roteamento de Gateway caso exista um fallback (Stripe/MP) já implementado.

### DLQ (Dead Letter Queue) Crescendo Aceleradamente
- **Sintoma:** Um alerta visual indica centenas de webhooks caindo na tabela `dead_letter_queue`.
- **Diagnóstico:** Indica erro lógico num deploy recente (ex: renomeação de coluna que o webhook usa). O webhook não está sendo processado.
- **Ação Imediata:** 
  1. Pare as retentativas (Desligue o Cron/Automator de DLQ temporariamente).
  2. Execute Rollback na Edge function (Deploy da versão anterior) ou Script de Rollback SQL que quebrou a tabela.
  3. Com a feature corrigida, force o script manual de consumir a DLQ.

---

## 📉 Anomalias de Negócio

### Split Falhando Constantemente
- **Sintoma:** Erro reportando divergência financeira. O recebedor não ganha comissão.
- **Runbook:**
  1. Desative temporariamente as regras de split na tabela `products.checkout_config` (`split_enabled = false`).
  2. Libere o pagamento de forma bruta e realize os acertos manuais no painel Asaas por Pix Avulso.

### Falha de Webhook (Webhook Parado)
- **Sintoma:** Clientes pagam no PIX mas a página de Obrigado não carrega. O log da Asaas não chega na `webhook_logs`.
- **Runbook:**
  1. Verifique se o DNS ou Endpoint do webhook foi alterado acidentalmente no painel do Asaas.
  2. O Supabase pode estar sofrendo de Cold Start violento nas Edge Functions.
  3. Como Mitigação: Exporte os pagamentos do Asaas e rode a RPC `handle_access_revocation` re-adaptada para liberação forçada em lote.

---

## ⏪ Rollback e Recovery

Todo Rollback obedece a hierarquia da falha:
- **Falha Visual / Conversão / GTM (Frontend):** Entrar na plataforma da Vercel / Cloudflare Pages e acionar `Rollback to this deploy`.
- **Falha Lógica / Processamento Financeiro (Edge):** Rodar o Supabase CLI com o Git resetado no commit funcional: `git reset --hard HEAD~1` -> `supabase functions deploy [name]`.
- **Corrupção de Dados / Tabela (Postgres):** Use os Backups automáticos de Point In Time Recovery (PITR) do Supabase para restaurar o schema corrompido, mas tenha extremo cuidado para exportar e salvar as vendas ocorridas DENTRO DO PERÍODO de outage para reinjetá-las após o restore.

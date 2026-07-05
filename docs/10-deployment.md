---
title: "Deploy e Ambiente"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "SRE e Operações"
status: "Estável"
related_files:
  - "16-operational-runbook.md"
---

# 10. Deployment e Variáveis

## 📌 Índice
1. [Estratégia de Deploy](#estratégia-de-deploy)
2. [Variáveis de Ambiente (.env)](#variáveis-de-ambiente-env)
3. [Checklists de Deploy](#checklists-de-deploy)
4. [Rollback](#rollback)

---

## 🚀 Estratégia de Deploy

A infraestrutura sendo servida como Jamstack + BaaS possui ramificações distantes no deploy:

1. **Frontend (Cloudflare Pages ou Vercel):**
   - O código HTML/CSS/VanillaJS está hospedado visando o Edge mais próximo do cliente.
   - Todo push na branch `main` executa deploy automático (não requer build steps demorados como `npm run build`). Tempo de roll-out: ~10 segundos.

2. **Backend e DB (Supabase CLI):**
   - Para aplicar novas migrações e tabelas: `supabase db push` ou rodar script manual no Editor SQL (Fase Inicial).
   - Para atualizar Edge Functions: `supabase functions deploy [function_name]`. A substituição do Worker na Cloudflare via Deno é instantânea.

---

## 🔒 Variáveis de Ambiente (.env)

**Aviso:** O Front-end só tem conhecimento de chaves "Anon". Todo secret fica encrustado no Supabase Secret Manager.

### Supabase Vault / Edge Functions
```env
# Provedores de Pagamento
ASAAS_API_KEY="nunca-commit"
ASAAS_WEBHOOK_TOKEN="nunca-commit"

# Integrações Marketing
META_CAPI_TOKEN="nunca-commit"
META_PIXEL_ID="729982690062335"

# Internas
SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
```

### Variáveis Globais Frontend (Injetadas em JS)
O `CONFIG` do arquivo `tracking.js` deve ser preenchido de modo estático de forma automatizada pelo CI/CD ou configurado no setup inicial da Cloudflare.

---

## ✅ Checklists de Deploy

### Pré-Deploy (Staging)
1. Certificar que nenhum `console.log` vazando payload de cartão foi subido na Edge function `asaas-create-payment`.
2. Verificar se o `.sql` de novas tabelas subiu com as Rules de `RLS` incluídas e habilitadas. NUNCA DEPLOY SEM RLS.

### Pós-Deploy (Produção)
1. Executar 1 pagamento em Sandbox e validar conversão CAPI no Gerenciador de Eventos (Meta).
2. Verificar tela "Obrigado" assegurando recebimento do ID corretamente.
3. Observar log do Supabase Functions após 5 minutos. Taxas altas de "500 Internal Server Error" significam Crash imediato.

---

## ⏪ Rollback

- **Front-end:** Realizar restore/rollback clicando no último deployment com sucesso no Cloudflare Pages/Vercel (Instantâneo).
- **Edge Functions:** Revertendo o commit da function e executando o push novamente (`supabase functions deploy`).
- **Banco de Dados (DB):** Alterações destrutivas devem ser evitadas. Se quebrar algo, efetuar rollback da migration via script contendo os comandos `DROP` ou `ALTER` reverso (Downgrade). Não recomendamos restaurar Snapshot via Supabase GUI a não ser em desastres críticos pois isso apagará novas compras feitas minutos atrás.

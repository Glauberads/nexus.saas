---
title: "Guia para Desenvolvedores"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Tech Lead"
status: "Estável"
---

# 11. Guia para Desenvolvedores

Bem-vindo ao Core Development do NexusSaaS. Leia isto antes de injetar código na branch principal.

## 📌 Índice
1. [Mentalidade e Padrões (Design Patterns)](#mentalidade-e-padrões-design-patterns)
2. [Criando uma nova Edge Function](#criando-uma-nova-edge-function)
3. [Criando uma nova Tabela / SQL](#criando-uma-nova-tabela--sql)
4. [Como criar RPCs Seguras](#como-criar-rpcs-seguras)

---

## 🧠 Mentalidade e Padrões (Design Patterns)

- **Performance Extreme (Frontend):** 
  - Trabalhamos em Vanilla JS no frontend focado nos visitantes da Landing Page. Cada kilobyte economizado significa uma conversão melhor. Não implemente React ou bibliotecas gigantes para fazer coisas simples.
  - Para dashboards internos de admin, libs CDN (como Chart.js) são permitidas pois o gargalo de LCP não afeta vendas.
- **Backend Driven Logic:**
  - O frontend é burro. Ele manda ação, espera o backend e renderiza o estado. Todo cálculo de impostos, split, e validação é feito na Edge Function ou RPC.

---

## ⚡ Criando uma nova Edge Function

O Supabase CLI facilita isso (uso de Deno).

**Passos:**
1. Rodar: `supabase functions new my-new-feature`
2. Escrever lógica usando os tipos estritos em `index.ts`.
3. Para comunicar com o DB sem respeitar RLS (Apenas em Background Jobs/Webhooks), utilize a `SUPABASE_SERVICE_ROLE_KEY` e não a anon_key.
4. Rode localmente: `supabase functions serve` e mande cURL POST para `http://localhost:54321/functions/v1/my-new-feature`.
5. Deploy: `supabase functions deploy my-new-feature`.

---

## 🗄 Criando uma nova Tabela / SQL

Mantenha a padronização. Tudo o que criamos tem UUID e timestamps padrão.

**Modelo Base:**
```sql
CREATE TABLE public.nova_tabela (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Seu conteúdo...
  nome TEXT NOT NULL
);

-- MANDATÓRIO: Ligar proteção
ALTER TABLE public.nova_tabela ENABLE ROW LEVEL SECURITY;

-- MANDATÓRIO: Dar Select restrito se necessário
CREATE POLICY "Permite leitura ao admin" 
ON public.nova_tabela 
FOR SELECT 
USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));
```

---

## 🔧 Como criar RPCs Seguras

Sempre utilize `SECURITY DEFINER` com Search Path trancado para que injeções não quebrem o schema nativo.

```sql
CREATE OR REPLACE FUNCTION public.my_custom_calculation(param_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    result jsonb;
BEGIN
    -- Lógica
    RETURN result;
END;
$$;
```

Para consumir essa RPC no frontend (via Supabase JS):
```javascript
const { data, error } = await supabase.rpc('my_custom_calculation', { param_id: '...' });
```

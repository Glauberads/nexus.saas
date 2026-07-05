---
title: "Remote Procedure Calls (RPCs)"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Arquitetura e Engenharia"
status: "Estável"
related_files:
  - "02-database.md"
---

# 04. Remote Procedure Calls (RPCs)

## 📌 Índice
1. [Objetivo e Arquitetura](#objetivo-e-arquitetura)
2. [Lista de RPCs](#lista-de-rpcs)
3. [Exemplos SQL e Performance](#exemplos-sql-e-performance)

---

## 🎯 Objetivo e Arquitetura

O Supabase permite a execução de funções diretamente no Postgres via chamada HTTP `rpc()`. O NexusSaaS emprega intensivamente RPCs com modificador `SECURITY DEFINER` para permitir que o Client execute lógicas complexas e consultas a tabelas altamente protegidas pelo RLS sem precisar de chaves privilegiadas.

- **Vantagem:** Otimiza o número de round-trips da rede.
- **Segurança:** Como roda em modo Definer, a função acessa o banco ignorando as policies, mas os parâmetros injetados validam se o chamador tem direito aos dados solicitados.

---

## 📜 Lista de RPCs

### 1. `get_checkout_status`
- **Objetivo:** Consultar o status em tempo real do pagamento do cliente durante o Polling do Checkout.
- **Parâmetros:**
  - `p_session_id` (UUID)
  - `p_session_token` (Text)
- **Retorno:** Status da sessão (Ex: `paid`, `pending`).
- **Segurança:** O token gerado na inicialização garante que quem está consultando o status de fato originou a intenção de compra. Se o token não bater, a RPC reverte silenciosamente (retorna null ou pending contínuo) para mitigar enumeração.
- **Quem consome:** Frontend (Polling no `checkout-app.js`).

### 2. `handle_access_revocation`
- **Objetivo:** Função ativada exclusivamente via Database Trigger.
- **Parâmetros:** Nenhum (Recebe contexto `NEW` e `OLD` da Trigger).
- **Retorno:** TRIGGER.
- **Fluxo:** Invalida acessos na tabela `member_products` sempre que a tabela `refunds` recebe status `processed` ou `subscriptions` entra em `CANCELLED/EXPIRED`.
- **Segurança:** Não exposta via HTTP.

### 3. `get_executive_metrics`
- **Objetivo:** Retornar o consolidado financeiro do dashboard.
- **Parâmetros:** N/A ou Range de datas.
- **Retorno:** JSON com KPIs (MRR, Vendas, Churn, Split Net).
- **Segurança:** Valida `auth.jwt() ->> 'email'` ou requer Role Admin.

### 4. `is_admin`
- **Objetivo:** Utilitário para validar privilégios do JWT na camada SQL.
- **Parâmetros:** N/A (Usa contexto da request).
- **Retorno:** Boolean.

---

## 🚀 Exemplos SQL e Performance

O uso de `SECURITY DEFINER` em PostgreSQL deve sempre fixar o `search_path`.
Todas as nossas RPCs obedecem esse padrão de Hardening.

**Exemplo Seguro de Criação:**
```sql
CREATE OR REPLACE FUNCTION public.get_checkout_status(p_session_id uuid, p_session_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status
    FROM public.sessions
    WHERE id = p_session_id AND session_token = p_session_token
    LIMIT 1;
    
    RETURN v_status;
END;
$$;
```

**Índices e Performance:**
A consulta acima atinge `Index Scan` absoluto no índice primário da tabela `sessions`, retornando usualmente em ~2ms de latência DB, perfeitamente compatível com o polling agressivo de 5s do client.

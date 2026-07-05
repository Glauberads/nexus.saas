---
title: "API Reference (APIs Internas)"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Arquitetura e Engenharia"
status: "Estável"
---

# 14. API Reference (APIs Internas e Edge Functions)

As Edge Functions atuam como a API do sistema. Elas rodam sobre o domínio do Supabase. A URL base é estruturada como:
`https://[PROJECT_ID].supabase.co/functions/v1/`

---

## ⚡ POST /asaas-create-payment

**Objetivo:** Intermediar a criação de cobranças de forma segura.
**Autenticação:** Bearer Token (Supabase Anon Key).

**Body Request:**
```json
{
  "lead_id": "uuid",
  "checkout_session_id": "uuid",
  "product_slug": "nexussaas-pro",
  "name": "Fulano",
  "email": "teste@email.com",
  "cpfCnpj": "12345678909",
  "billingType": "PIX",
  "installments": 1,
  "correlation_id": "1234-abcd-..."
}
```
*(Se for Cartão de Crédito, adicionar o nó `creditCard` e `creditCardHolderInfo`).*

**Response Sucesso (200 OK):**
```json
{
  "success": true,
  "payment_id": "pay_123456",
  "pix": {
    "encodedImage": "iVBORw0KGg...",
    "payload": "00020126580014br.gov.bcb.pix..."
  }
}
```

**Erros Comuns:**
- `400 Bad Request`: `{ "success": false, "error": "Cartão recusado pelo emissor." }`
- `500 Server Error`: Erro inusitado, logado no Correlation ID.

---

## ⚡ POST /asaas-webhook

**Objetivo:** Escutar notificações de pagamento do Gateway Asaas.
**Autenticação:** Header personalizado configurado dentro do Asaas: `asaas-access-token: [SEU_TOKEN_SECRETO]`.

**Body Request:** (Padrão Asaas Webhook V3)
```json
{
  "event": "PAYMENT_CONFIRMED",
  "payment": {
    "id": "pay_98765",
    "customer": "cus_123",
    "value": 197.00
  }
}
```

**Response Sucesso (200 OK):**
*Empty Body* (O Gateway não processa body de retorno).
**Ação Interna:** Se o `payment.id` não for duplicado na tabela de idempotência, a licença é creditada.

---

## ⚡ POST /capture-lead

**Objetivo:** Gravar sessão ou lead persistente sem expor lógica SQL.
**Autenticação:** Bearer Token (Anon Key).

**Body Request:**
```json
{
  "action": "create_checkout_session",
  "product_id": "uuid",
  "amount": 197.00,
  "utm_source": "ig_ads",
  "correlation_id": "abcd-1234"
}
```

**Response Sucesso (200 OK):**
```json
{
  "id": "session-uuid",
  "session_token": "token-hash-xyz"
}
```

---

## ⚡ POST /capi-relay

**Objetivo:** Disparar conversões offline e Server-Side API pro Meta.
**Autenticação:** Bearer Token (Anon Key). Restrito via CORS.

**Body Request:**
```json
{
  "event_name": "InitiateCheckout",
  "session_id": "uuid",
  "event_source_url": "https://meudominio.com",
  "em": "d258b348d...", 
  "ph": "a4d33a01...", 
  "value": 197.00,
  "currency": "BRL"
}
```
*Note que PII (`em` e `ph`) chegam já com hash SHA-256 gerado pelo front.*

**Response:**
`200 OK` (Operação Fire-and-Forget, não aguarda retorno do Facebook para não atrasar o front).

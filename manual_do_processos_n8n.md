# Manual de Processos: Integração NexusSaaS + n8n

Este manual contém todas as especificações técnicas, formatos de payload e passos de segurança que você precisa para plugar o seu **n8n** na arquitetura do NexusSaaS. 

O NexusSaaS não se comunica diretamente com a API do WhatsApp. Ele despacha os gatilhos brutos para o n8n. O seu n8n recebe, processa e dispara as mensagens.

---

## 🔒 1. Segurança e Autenticação (Obrigatório)

Para evitar que curiosos ou bots enviem requisições falsas para o seu n8n e acabem disparando mensagens para os seus clientes, implementamos uma camada de segurança no Supabase.

Qualquer Webhook que sair do NexusSaaS em direção ao n8n levará o seguinte Cabeçalho Oculto (Header):

- **Header Key:** `x-nexus-secret`
- **Header Value:** `NEXUS_N8N_SECRET_123` *(O valor configurado na Fase 9)*

> No seu nó Webhook do n8n, você pode criar uma validação simples via *If* (Se `header.x-nexus-secret` != `NEXUS_N8N_SECRET_123`, dropar a execução), ou configurar uma Header Auth nativa no próprio nó do Webhook.

---

## 🔌 2. Como Plugar um Fluxo Novo

Sempre que você criar um novo Workflow no n8n:
1. Adicione um **Webhook Node** como gatilho inicial.
2. Mude o Método HTTP para **POST**.
3. Copie a `Test URL` (para testes) ou a `Production URL` (para rodar ao vivo).
4. Abra o painel do NexusSaaS > Aba `🤖 Automações` > Cole a URL na caixa correspondente.
5. Clique em **💾 Salvar URLs**.
6. Use o botão **⚡ Disparar Automação de Teste** no painel Admin para enviar a primeira carga. Isso vai popular o esquema do n8n, permitindo que você arraste as variáveis (como {{name}} e {{whatsapp}}) facilmente para os blocos seguintes.

---

## 📦 3. Estrutura dos Payloads (JSON)

Esses são os pacotes de dados exatos que o NexusSaaS envia para o n8n. Você pode usá-los no "Mock Data" do n8n caso queira desenhar a automação antes de testá-la no painel.

### 🔥 Lead Fervendo (`hot_lead`)
Disparado quando um visitante atinge Score 76+, Tier 'Muito Quente', ou dispara um evento de `ReadyToBuy`.

```json
{
  "type": "hot_lead",
  "name": "João Silva",
  "whatsapp": "11999999999",
  "email": "joao@email.com",
  "score": 91,
  "tier": "muito_quente",
  "utm_source": "facebook_ads",
  "utm_campaign": "conversao_novembro",
  "last_event": "ReadyToBuy",
  "checkout_started": true,
  "pricing_viewed": true,
  "is_test": false
}
```

### 💰 Recuperação (`checkout_recovery`)
Disparado quando o Lead tenta comprar, mas o banco de dados confirma que a compra não foi concluída após 15 minutos (para Cartões) ou 1 hora (para Pix).

```json
{
  "type": "checkout_recovery",
  "name": "Maria Sousa",
  "whatsapp": "21988888888",
  "email": "maria.sousa@email.com",
  "payment_method": "pix",
  "abandonment_type": "waiting_payment",
  "utm_source": "google_search",
  "is_test": false
}
```

### 🚀 Venda Aprovada (`purchase_onboarding`)
Disparado assim que a Kiwify/Hotmart acusa pagamento aprovado.

```json
{
  "type": "purchase_onboarding",
  "name": "Carlos Mendes",
  "whatsapp": "31977777777",
  "email": "carlos.m@email.com",
  "amount": 497,
  "product_name": "NexusSaaS Pro",
  "order_id": "ORD-982183",
  "is_test": false
}
```

---

## 💡 4. Dicas de Construção no n8n

1. **Evite Mensagens Robóticas:** Como você tem a variável `utm_source` chegando no n8n, você pode criar uma condicional (Switch) no n8n:
   - *Se utm_source = tiktok*: "Fala {{name}}, vi que você chegou pelo TikTok..."
   - *Se utm_source = linkedin*: "Olá {{name}}, notei seu interesse profissional..."
   
2. **Alertas da Equipe:** Não faça o n8n apenas mandar mensagem para o cliente. Use um nó do Telegram ou do Discord para alertar você mesmo no celular: *"🚨 Lead super quente rastreado agora. Chama ele: wa.me/55{{whatsapp}}"*.

3. **Duplicidade:** Você não precisa se preocupar em colocar filtros de "anti-spam" no n8n (ex: verificar se o lead já recebeu alerta hoje). A **Edge Function do Supabase já faz isso** antes mesmo de enviar o webhook, economizando execuções e dinheiro no seu n8n.

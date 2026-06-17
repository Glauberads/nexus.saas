# Guia de Criação de Produtos e Gestão Financeira - Nexus SaaS

Este documento reúne todas as informações necessárias para você criar, configurar e gerenciar produtos no Nexus SaaS, garantindo que a comunicação com o Checkout e com o Gateway (Asaas) seja perfeita.

---

## 1. O Básico do Produto

Ao clicar em **➕ Novo Produto** no painel da Central Financeira, você verá vários campos. Preencha com atenção, pois eles afetam tanto a estética quanto a operação da plataforma.

* **Nome do Sistema:** O nome comercial do seu produto (ex: *CRM Imobiliário Turbo*). Ficará visível no Checkout e na Área de Membros.
* **Slug (Único):** É a URL amigável do seu produto. Não use espaços ou acentos. 
  * Exemplo: `crm-imobiliario`. 
  * O link de vendas do seu checkout será: `nexussaas.../checkout.html?product=crm-imobiliario`.
* **Imagem da Capa:**
  * **Tamanho Ideal:** Recomendamos 800x800px (Quadrado) ou 1280x720px (Widescreen).
  * **Upload:** O sistema suporta upload direto do PC. *Nota: Para funcionar, o bucket `images` precisa estar criado e configurado como Público no Supabase Storage.*
* **Tipo (Access Type):**
  * *Sistema Base (Core):* O produto principal.
  * *Bônus/Upsell:* Tipos adicionais que podem ter regras de liberação secundárias na área de membros.
* **Status:** Mantenha em "Rascunho" enquanto ajusta preços e imagens. Mude para "Ativo" apenas quando o produto estiver 100% pronto para receber compras. Produtos Inativos não podem ser comprados.

---

## 2. Dados Comerciais e Motor de Preços

A arquitetura financeira do Nexus SaaS (Fase 12.3) foi desenhada para ser altamente segura. **O preço cobrado é sempre o preço oficial registrado no banco de dados**, o checkout front-end atua apenas como vitrine.

* **Preço Base (R$):** É o valor original/ancoragem. Exemplo: `997.00`.
* **Preço Promocional (R$):** Se houver qualquer valor aqui maior que zero (ex: `497.00`), este será o valor final cobrado no cartão/boleto. O Preço Base aparecerá riscado no checkout. Se não houver promoção, deixe vazio.
* **Desconto PIX (%):** Informação extra que o painel enviará para o Asaas. Exemplo: Se o produto custa R$ 100,00 e o desconto for `10`, o cliente pagará R$ 90,00 ao escolher a opção PIX no checkout.
* **Máximo de Parcelas (Cartão):** Limita o parcelamento (o padrão é 12x). Você pode limitar produtos baratos para apenas 1x ou 3x, evitando juros desnecessários.

---

## 3. Fluxo de Pós-Venda

* **URL Thank You Page:** Ao preencher este campo, o cliente será redirecionado para essa página customizada assim que o pagamento no Cartão for aprovado ou o PIX for gerado (com o QRCode exibido lá). Se deixar vazio, usará a página de sucesso padrão do Nexus.
* **URL da Documentação:** Link do Notion, Google Docs ou base de conhecimento, útil para a área de acesso logada do usuário.

---

## 4. Integração Financeira (Como o sistema enxerga a venda)

Toda vez que uma compra é iniciada com a aba **Central Financeira** operante, os seguintes passos de segurança acontecem nos bastidores:

1. **Geração Silenciosa (Edge Functions):** O navegador nunca envia chaves de API. O painel envia apenas o *Slug* do produto. A nuvem (Edge Function) verifica o preço real do produto, descriptografa a sua API Key do Asaas, calcula o desconto PIX e gera a cobrança com total segurança.
2. **Recepção do Pagamento (Webhooks):**
   * O cliente pagou via PIX ou o cartão foi aprovado. O Asaas dispara um aviso (Webhook).
   * A nossa Edge Function do Webhook intercepta a mensagem, confere o **Webhook Token Criptografado**, valida a origem e dá baixa no banco de dados em questão de milissegundos.
   * O status do acesso do cliente muda para `Liberado`.
3. **Tratamento de Estornos/Chargeback:**
   * Caso haja reembolso, o webhook registrará o evento e suspenderá automaticamente o acesso aos produtos daquela compra.
4. **Logs e Otimização:** 
   * Na aba "Visão Geral" você vê os KPI's de vendas atualizados em tempo real.
   * O sistema arquiva todas as requisições de pagamento. Eventos triviais (como atualização de boleto) são excluídos após 30 dias para poupar memória, mas eventos de Receita, Estorno e Erros graves ficam guardados no seu banco permanentemente.

---

## Resumo do Check-list Antes do Lançamento
- [ ] Produto cadastrado com Nome, Slug, Descrição e Capa.
- [ ] Preço Base (e Promocional) definidos.
- [ ] Desconto PIX e Max Parcelas ajustados para a oferta.
- [ ] Status definido como "Ativo".
- [ ] Gateway (Asaas) devidamente configurado, verde e testado na aba "Gateways".
- [ ] **Chave PIX Exclusiva Gerada no Asaas:** Certifique-se de acessar `Minha Conta > Chaves Pix` no Asaas e criar uma chave aleatória. Se isso não for feito, a API recusará cobranças via PIX com o erro *invalid_billingType*.
- [ ] Webhook do Asaas ativado e enviando eventos para a Edge Function do sistema.

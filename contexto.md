# Contexto do Projeto NexusSaaS

## Identidade e Posicionamento
- **Nome do Produto**: NexusSaaS
- **Checkout**: `https://membros.glauberads.com.br/c/jy773ql`
- **Missão**: Fornecer um marketplace com mais de 30 sistemas SaaS prontos ("white-label") para que Infoprodutores, Agências Digitais, Gestores de Tráfego, Afiliados e Freelancers possam lançar produtos próprios e monetizar rapidamente, pulando os meses de desenvolvimento.
- **Identidade Visual**: Premium, internacional, baseada em referências como Stripe, Linear, Vercel e Framer. Uso de modo escuro (Dark Mode) com tons de cinza escuro, branco puro e um tom vibrante de laranja (Accent).

## Fase 1: Estrutura da Landing Page (HTML/CSS)
A página (`index.html`) é composta por seções otimizadas para conversão e performance (UX/UI Premium):

1. **Header/Nav**: Navegação responsiva com links principais e CTA de checkout.
2. **Hero Section**: Headline forte e animada, subheadline focada em tempo de entrega, tags de prova social e um Mockup visual imponente.
3. **VSL (Video Sales Letter)**: Espaço reservado para vídeo focado em conversão e explicação da plataforma.
4. **Para Quem É**: Cards interativos identificando o público-alvo.
5. **Pain Section (Dor)**: Tabela comparativa "Do jeito difícil (❌)" vs "Com a NexusSaaS (✅)".
6. **Lead Magnet**: Formulário estratégico para captar leads (Nome, Email, WhatsApp).
7. **Process (How it works)**: Timeline de 4 passos simples.
8. **Systems Gallery**: Cards dos sistemas mais vendidos.
9. **Calculadora de Faturamento**: Simulador interativo que projeta ganhos mensais e anuais.
10. **Value Perception (Precificação)**: Tabela de Ancoragem (R$ 8.485+ vs R$ 600).
11. **Comparativo**: Tabela técnica detalhada "NexusSaaS vs Desenvolvimento do Zero".
12. **Testimonials**: Cards simulando mensagens de WhatsApp com depoimentos e ROI de clientes.
13. **FAQ**: Accordion expansível de perguntas frequentes.
14. **Final CTA**: Botão forte final focado em fechar a venda com gatilhos de garantia.
15. **Modais de Growth (Exit Intent e Quiz)**: Estruturas de retenção e qualificação de visitantes.

## Fase 2: Escala e Otimização Avançada

Implementamos um ecossistema avançado de captação de dados, dashboards e funis de recuperação de vendas (Fase 2) para transformar a NexusSaaS em uma máquina robusta de aquisição no Google e Meta Ads.

### O Motor `tracking.js` Avançado
- **Lead Scoring System de 4 Níveis**: Os usuários recebem pontos com base na interação (scroll, faq, tempo, vídeo) e são classificados em 4 níveis de temperatura:
  - Frio (0-25)
  - Morno (26-50)
  - Quente (51-75) → Dispara o evento `QualifiedLead` para o Meta e GA4.
  - Muito Quente (76-100) → Dispara o evento `ReadyToBuy` para remarketing de altíssima conversão.
- **Rastreamento Multi-Canal**: Suporte nativo para tags do Google Ads (`gtag conversion`) lado a lado com o Pixel da Meta e o CAPI.

### O Cliente Supabase (`supabase-client.js`)
Lida com a integração em tempo real com o banco de dados e foi expandido com:
- **Jornada do Lead (`lead_journey`)**: Função que grava cada clique crucial na linha do tempo do usuário (view_upsell, upsell_accept, cart_abandon, etc).
- **Atribuição Multi-Touch (`attribution`)**: Módulo pronto para salvar a origem do primeiro e último clique para rastreamento transparente de ROAS.

### O Novo Quiz de Alta Qualificação
O Quiz no `index.html` foi transformado em um funil de 4 passos (Diagnóstico de Objetivo, Faturamento Atual, Conhecimento Técnico e Urgência). Dependendo das respostas do usuário, o sistema injeta "pontos extras" no Score Global, podendo classificar o usuário imediatamente como "Alto Potencial", o que adapta o texto final exibido para o lead.

### Dashboard Administrativo Executivo
Página `admin-dashboard.html` privada e conectada diretamente ao Supabase para fornecer análise em tempo real sem precisar abrir o Meta Ads:
- **Painel de Atribuição**: Gráfico com o tráfego mapeado por UTM_Source e termômetro circular dividindo a base de leads em Frios, Mornos e Quentes.
- **Leads Qualificados**: Uma tabela listando dinamicamente os Leads Quentes/Muito Quentes, exibindo score, contato e origem para contato comercial ativo, se necessário.

### Funil de Upsell 1-Click
Página `upsell.html` projetada para aparecer após a compra principal, focada na conversão do serviço premium de **Instalação Profissional (Done For You)** por R$ 297, contendo rastreamento nativo de `UpsellAccept` e `UpsellDecline`.

---

## Estrutura Backend Serverless (Supabase Edge Functions)

O projeto utiliza funções backend para envio de dados sigilosos e contorno de AdBlockers:

1. **`capi-relay`**:
   - Atua como um servidor CAPI (Conversions API). Envia de forma Server-side as conversões para o Facebook Graph API usando o Access Token oculto (`META_CAPI_TOKEN`), mascarando o IP do servidor e deduzindo pelo Event ID.

2. **`purchase-webhook`**:
   - Endpoint destinado a receber pings de compra (status: approved) de plataformas como Hotmart/Kiwify e atualizar o `lead_status` para `purchased`.

3. **`abandonment-recovery` (NOVO - Fase 2)**:
   - Endpoint destinado a receber o aviso de "abandono de carrinho" ou "compra cancelada".
   - Atualiza o CRM (tabela leads) para `checkout_abandoned`.
   - Dispara em tempo real o evento `CheckoutAbandoned` na API de Conversões do Meta, enriquecendo o público de remarketing antes mesmo que o usuário abra o Instagram novamente.
   - Estrutura pronta para conectar via POST (webhook) no n8n ou ActiveCampaign no futuro.

---

## Estrutura do Banco de Dados (`sql/schema.sql`)
1. **`leads`**: CRM Principal. Contém Nome, WhatsApp, Email Hash (para Meta), Lead Score, Lead Tier, Lead Status, Respostas do Quiz e **LTV** (Life Time Value).
2. **`sessions`**: Rastreamento de sessões com UTMs e persistência de IDs de cookies.
3. **`events`**: Log cru de todos os eventos disparados no frontend.
4. **`purchases`**: Base de vendas e valores recebidos via Webhooks de pagamento.
5. **`lead_journey`**: Tabela em formato de Timeline (Histórico de ações detalhado por usuário).
6. **`attribution`**: Tabela para mapeamento do First Touch e Last Touch.

## Status da Implementação Completa (Fase 1 e 2)
✅ Todos os arquivos HTML, CSS, e JS estruturados e otimizados.
✅ Score inteligente rodando e enviando tags baseadas na temperatura do Lead.
✅ Painel Executivo (Admin) rodando localmente, gerando gráficos usando Chart.js via Supabase.
✅ Funil de Upsell ativo e com rastreamento implementado.
✅ Recuperação de vendas (Webhook Backend) operante.
✅ Todo o código versionado na pasta local.

---

## Fase 2.5: Otimização da Hero e Conversão (Above The Fold)
Uma atualização focada no ganho de valor imediato, transmitindo ao usuário toda a proposta de valor em menos de 5 segundos.

### Layout em Grid (2 Colunas)
- O `index.html` foi refatorado para exibir o Mockup do Dashboard Premium ao lado do Copy (em telas maiores), sem precisar rolar a página.

### Elementos de Prova e Segurança
- **Lista de Benefícios Premium**: Lista com ícones de check logo abaixo da subheadline (30+ sistemas, R$50k+ valor, Código-fonte).
- **Indicadores Rápidos (Stats)**: Estilização vítrea para exibir estatísticas impactantes antes da dobra (4h para lançar, 100% White Label).
- **Trust Bar**: Uma barra de segurança abaixo do CTA indicando *Compra Segura*, *Acesso Imediato* e *Licença Comercial*.
- **Scroll Cue Animado**: Setinha de incentivo de scroll.

### Micro-interações
- Atualização em `styles.css` para reflexos nos CTAs, glow backgrounds pulsantes no Mockup e responsividade alinhada.

### Tracking e Teste A/B Preparado (`script.js` e `tracking.js`)
- Lógica base do Teste A/B desenvolvida para sortear a Headline (A/B/C), mas mantida com a flag **Desativada** focando 100% do tráfego na Variante A até atingir maturidade estatística.
- Integração de `IntersectionObserver` para rastrear: `Hero_View`, `TrustBar_View` e `ValueProof_View`.
- Listeners de clique nativos para: `Hero_CTA_Click` e `Hero_Secondary_Click`.
- Tudo sincronizado via GA4 e Meta CAPI.

---

## Fase 3: Nova Oferta Estratégica (Reprecificação)
A comunicação financeira da Landing Page foi inteiramente reestruturada para gerar maior urgência e senso de economia.
- **Preço**: De R$600 para **R$497** (ou 12x de R$47,11).
- **Ancoragem de Valor**: Adicionada a seção dissecando os preços individuais de cada sistema (ex: Sistema Imobiliário por R$997, VIP Delivery R$997) vs O "pacote tudo incluso" da NexusSaaS.
- **Eventos Atualizados**: Todos os disparos de Meta/GA4 (Offer_Click, InitiateCheckout) agora refletem o valor hardcoded de `value: 497`. 

---

## Fase 4 e 5: Admin Dashboard Premium & Integração Supabase
A interface de controle executivo (`admin-dashboard.html`) deixou de ser um simples visualizador de gráficos e se tornou um CRM / Painel de Analytics Single Page Application (SPA).
- **Supabase Auth Guard**: Rota `admin-login.html` exige login para acessar o painel, aceitando estritamente o email `suporteglauberr@gmail.com`. A própria requisição SPA carrega esse token JWT.
- **Deduplicação de Métricas Inteligente**: Ao invés de somar PageViews sujos, a leitura de Visitantes conta o número de *identificadores de sessão (session_id) distintos*, refletindo pessoas únicas. O mesmo ocorre no funil de eventos (View -> Lead -> InitiateCheckout).
- **Filtro Temporal Global**: Dropdown integrado (Hoje, 7D, 30D, Tudo) que aplica a query de banco de dados nativamente em todas as funções.
- **Módulo Leads e Drawer Lateral**: Ao clicar em um Lead quente, o painel expande um *Off-canvas Drawer* contendo o CRM dele, incluindo a jornada completa extraída de `lead_journey`.

---

## Fase 6: Central de Webhooks (Monitoramento de Checkout)
A plataforma ganhou conectividade visual direta com os meios de pagamento (Hotmart/Kiwify).
- **Nova Tabela e Edge Function**: Adicionada a tabela `webhook_logs` e a função serverless `purchase-webhook` que mascara dados sensíveis (LGPD) e valida a chave secreta `x-webhook-secret` (Prevenção de Ataques).
- **Módulo UI**: Nova aba dedicada no Dashboard (`🔌 Webhooks`) que usa o Supabase Realtime para escutar os disparos do backend. É possível enviar um "Webhook Fake de Teste" pelo frontend que é processado e retorna o Status HTTP instantaneamente.

---

## Fase 7: Segurança Enterprise e RLS (Banco de Dados Blindado)
Prevenção pesada contra extração de dados públicos (scrapping). O Supabase teve sua camada de proteção ativada (Row Level Security).
- O tráfego anônimo da Landing Page que usa o `SUPABASE_ANON_KEY` só tem permissões ativas para executar `INSERT` nas tabelas. Ler ou apagar dados retorna `Erro 401`.
- A função auxiliar PostgreSQL `is_admin()` verifica matematicamente as *claims* do JWT da requisição em busca do email aprovado. Se for legítimo, as restrições caem, garantindo segurança hermética do painel.
- Tudo sincronizado via GA4 e Meta CAPI.

---

## Fase 8: Checkout Customizado (Front-end Integrado)
Criação de um sistema de checkout próprio (`checkout.html`) que abandona a dependência de plataformas externas (como Hotmart) para exibição do carrinho.
- **Carrinho Local:** Script local capaz de buscar os produtos e upsells na base do Supabase e renderizar dinamicamente.
- **Cálculo em Tempo Real:** Atualização de totais, juros de parcelamento e descontos de PIX via JavaScript sem recarregar a página.

---

## Fase 9: Área de Membros (Cliente)
Desenvolvimento do portal do aluno/cliente (`cliente-login.html` e `cliente-dashboard.html`).
- **Autenticação Segura:** Login protegido via Supabase Auth.
- **Painel de Acesso:** Interface onde o cliente visualiza suas assinaturas ativas, links de documentação e status de pagamento de forma fluida e responsiva.

---

## Fase 10: Componentes Avançados e Modais
Polimento estético de componentes-chave do sistema.
- **Modais Nativos:** Padronização dos pop-ups (Quiz, Exit Intent, Gateways) garantindo acessibilidade e experiência de usuário premium em mobile e desktop.
- **Aprimoramento Visual:** Adição de micro-animações, *glow effects* e responsividade ajustada para tabelas de comparação.

---

## Fase 11: Reformulação de Produtos e Ofertas
Estruturação da interface de produtos no painel administrativo.
- **CRUD Completo:** Permite criar, editar e configurar detalhes vitais dos produtos (Preço, Slug, Capa, Desconto PIX, Max de Parcelas).
- **Integração Total:** Conectividade direta entre os produtos do banco de dados e a leitura dinâmica feita pelo Checkout.

---

## Fase 12: Arquitetura Enterprise Multi-Gateway (Integração Asaas)
Uma das fases mais críticas, centralizando a inteligência financeira e segurança de cobranças.
- **Tabelas Dedicadas:** Criação de `gateway_settings`, `asaas_customers`, `asaas_payments` garantindo rastreabilidade financeira 100%.
- **Edge Functions Seguras:** Função `asaas-create-payment` que processa a geração de PIX e Boletos de forma invisível. O front-end nunca toca nas chaves da API.
- **Tratamento de PIX e Boletos:** Geração instantânea de QR Code dinâmico do Asaas diretamente na interface do Checkout. (Observação vital: O lojista deve gerar ativamente uma chave PIX dentro do Asaas para liberar as cobranças, evitando o erro `invalid_billingType`).

---

## Fase 13: Auditoria Rigorosa Mobile (Overflow Horizontal)
Resolução de problemas crônicos de responsividade onde o layout "vazava" na tela do celular (overflow horizontal).
- **Tabelas Deslizantes:** `overflow-x: auto` e `min-width` aplicado na tabela de comparação.
- **Padding e Box-Sizing Agressivo:** Bloqueio estrito no formulário do Lead Magnet e Modais para forçar componentes a respeitarem a margem de segurança de telas até 320px, permitindo quebra de texto em botões gigantes.

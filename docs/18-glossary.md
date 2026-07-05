---
title: "Glossário e Definições"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Arquitetura e Negócios"
status: "Atualizado"
---

# 18. Glossário de Termos do Sistema

Para alinhar a linguagem ubíqua (Ubiquitous Language) entre devs, negócios e inteligência artificial, listamos os principais acrônimos e nomes do sistema NexusSaaS.

---

### A
- **Analytics Executivo:** Painel administrativo interno (`admin-dashboard.html`) focado na extração de KPIs gerenciais usando os agregados em tempo real de banco de dados.

### C
- **CAPI (Conversions API):** Interface nativa do Meta (Facebook) permitindo envio de dados Server-to-Server, burlando bloqueadores de anúncios e restrições de navegadores.
- **Checkout Session:** Instância efêmera de um processo de compra gerado na visualização inicial do checkout. Garante o `correlation_id` mesmo se a pessoa não preencher email no começo.
- **Correlation ID (CID):** Um UUID universal gerado no momento zero da navegação. Rastreia o usuário e atravessa do Javascript para os servidores em cada header, ajudando no diagnóstico de bugs cross-service.

### D
- **DataLayer:** Objeto JSON global do navegador (`window.dataLayer`) que funciona como a "caixa d'água" de métricas. O sistema preenche o dataLayer, e as ferramentas de marketing "bebem" dele via GTM.
- **DLQ (Dead Letter Queue):** Fila de mensagens do sistema (Ex: webhooks falhos) que não puderam ser processadas após a tentativa inicial, aguardando tratamento assíncrono para evitar a perda da informação (perda financeira).

### H
- **Hardening:** Processo prático de mitigar vulnerabilidades e fechar portas de exposição de uma infraestrutura (Ocultar chaves, travar políticas de acesso a banco de dados).

### J
- **JWT (JSON Web Token):** Padrão industrial que codifica dados em um token (Auth). É através do decodificador de JWT da Supabase (via PostgreSQL claim `auth.jwt()`) que determinamos se quem executou a Query é Admin ou membro pagante comum sem precisar rodar um SELECT adicional na tabela de usuários.

### L
- **Lead Score (LS):** Mecanismo puramente Javascript e DB para quantificar engajamento. Quanto mais tempo na tela ou mais interações no funil de vendas, maior o score, convertendo Frio → Muito Quente.

### R
- **RLS (Row Level Security):** Funcionalidade nativa do PostgreSQL. Age como um guardião matemático das linhas. O Frontend não consegue ver registros em que a "Policy" do RLS não permita, eliminando dependência maciça de validação nos middlewares backend.
- **RPC (Remote Procedure Call):** Analogamente a "Stored Procedures", é um script (Ex: escrito em PL/pgSQL) acionado pela API (Supabase) via JSON over HTTP que devolve a resposta final. Economiza Round-trips.

### S
- **SRE (Site Reliability Engineering):** Disciplina focada em software designando que um sistema esteja disponível e mantenha sua performance. Aplicações reais lidando com pagamentos precisam desse pilar (Correlation ID, Idempotência).
- **Split:** Divisão na fonte. Se o produto custa 100 reais, o sistema informa ao gateway para depositar 70 na carteira A e 30 na carteira B.

### U
- **UTM (Urchin Tracking Module):** Parâmetros rastreadores acoplados às URLs vindas de Ad-Networks (`?utm_source=facebook`). O sistema persiste isso num ciclo local para provar Atribuição Multi-touch.
- **Upsell OTO (One Time Offer):** Oferta única. Apresenta-se ao cliente imediatamente após a compra validada, exigindo apenas um clique (One-Click-Buy) para efetivar nova cobrança caso o ID do customer já suporte Tokenização via Gateway Asaas.

---
title: "Registro de Decisões Arquiteturais (Decision Log)"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Arquitetos de Software"
status: "Atualizado"
---

# 17. Registro de Decisões Arquiteturais (ADRs)

Este log lista escolhas técnicas que moldam o core do NexusSaaS, justificando o porquê adotamos ou rejeitamos tecnologias. Sempre mantenha atualizado ao introduzir grandes frameworks.

---

### ADR 001: Por que Supabase? (Em vez de Firebase, AWS RDS)
- **Contexto:** Precisávamos de um banco relacional escalável com autenticação, mas com deploy rápido tipo BaaS.
- **Problema:** RDS requer manutenção de VPC. Firebase usa NoSQL (Firestore), o que complica queries financeiras (ACID).
- **Decisão:** Escolher Supabase.
- **Consequências (Prós/Contras):** Ganhamos PostgreSQL real, Edge Functions nativas, RLS (Row Level Security). Contra: Dependência parcial (Vendor Lock-in no auth e functions).

### ADR 002: Por que Vanilla JS (Em vez de React / Next.js) no Front
- **Contexto:** Plataforma precisa de altíssima conversão de LP.
- **Problema:** React e frameworks injetam bundles massivos de JS que aumentam o LCP (Largest Contentful Paint) no mobile (3G) e matam as vendas de topo de funil.
- **Decisão:** O Front de vendas é HTML e Vanilla JS puristas.
- **Consequências:** Site abre em menos de 1 segundo. Mas a manutenção de componentes vira "copiar e colar" templates em vez de componentização estrita. O tradeoff é aceitável, pois LPs raramente exigem estado mutável denso.

### ADR 003: Por que Google Tag Manager como Orquestrador
- **Contexto:** As campanhas exigem o disparo do Meta, GA4, e Google Ads simultaneamente.
- **Problema:** Hard-codar cada pixel nos botões HTML gerava lixo no código e manutenção caótica se a conta banir.
- **Decisão:** Toda a engenharia de tráfego injeta um objeto padronizado no `dataLayer`. O GTM lê e distribui para as adnets apropriadas.
- **Consequências:** O marketing ganha independência. O desenvolvedor escreve tracking code uma vez.

### ADR 004: Por que Asaas
- **Contexto:** Recebimento financeiro B2B SaaS.
- **Problema:** Stripe possui Split fraco para o mercado local e não foca em PIX. MercadoPago bloqueia accounts por fraude com alta falsa-positiva.
- **Decisão:** Asaas como Gateway primário.
- **Consequências:** PIX transparente e gestão de assinaturas nativa robusta.

### ADR 005: Por que Edge Functions e RPCs (e não um Backend Node.js Centralizado)
- **Contexto:** Custos de servidor (EC2) para lidar com spikes de ads.
- **Problema:** Pagar instâncias EC2 Idle ou lidar com cluster Kubernetes é pesado (Over-engineering).
- **Decisão:** Serverless Edge Functions + Database RPCs.
- **Consequências:** Auto-escala instantânea pra 10 mil users em segundos. Custo próximo de zero em momentos ociosos. Redução de latência por processar na "borda" (V8 Isolates).

### ADR 006: Por que Chart.js para o Analytics Executivo
- **Contexto:** Construção de gráficos de monitoramento sem recorrer a ferramentas pagas pesadas (Metabase/PowerBI).
- **Decisão:** Incorporação simples de Chart.js carregado via CDN.
- **Consequências:** Redução de custos e independência do painel (roda dentro da própria plataforma). Requer, todavia, Materialized Views no banco para evitar que o chart engine trave o DB tentando agrupar dados.

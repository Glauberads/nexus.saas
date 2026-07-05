---
title: "NexusSaaS - Documentação Técnica (Developer Docs)"
version: "1.0.0"
last_updated: "2026-07-05"
platform_version: "v2.0"
author: "Arquitetura e Engenharia"
status: "Estável"
related_files:
  - "NEXUSSAAS_CONTEXT.md"
---

# NexusSaaS — Documentação Técnica (Developer Docs)

Bem-vindo à documentação oficial de desenvolvimento do **NexusSaaS**. Este material foi estruturado para atuar como a Fonte Única de Verdade (Single Source of Truth) para integração, manutenção e expansão técnica da plataforma.

## 📌 Índice

1. [Sobre o Projeto](#sobre-o-projeto)
2. [Arquitetura Geral](#arquitetura-geral)
3. [Navegando pela Documentação](#navegando-pela-documentação)
4. [Princípios e Diretrizes](#princípios-e-diretrizes)

---

## 🚀 Sobre o Projeto

O **NexusSaaS** é uma plataforma inovadora projetada para comercializar mais de 30 sistemas White-Label prontos para uso. O objetivo é permitir que agências, gestores de tráfego e empreendedores lancem soluções robustas em questão de horas sem custos massivos de desenvolvimento.

**Diferenciais Técnicos:**
- Rastreamento avançado (Meta CAPI, GA4, GTM).
- Score dinâmico de Leads.
- Split financeiro multi-gateway.
- Dashboard analítico integrado.

## 🏗 Arquitetura Geral

O projeto adota uma arquitetura Serverless hiper-otimizada:
- **Frontend:** Vanilla JS, HTML e CSS visando carregamento sub-segundo, eliminando complexidades de frameworks como React ou Vue para Landing Pages focadas em conversão extrema.
- **Backend (BaaS):** Supabase provê PostgreSQL nativo, Edge Functions (Deno/Typescript) para regras de negócio e integrações, além de Row Level Security (RLS) para controle de acesso granular.

> Para a visão executiva e resumo macro, consulte sempre o [NEXUSSAAS_CONTEXT.md](../../NEXUSSAAS_CONTEXT.md) na raiz do repositório.

## 📂 Navegando pela Documentação

A documentação está modularizada para facilitar o onboarding de novos desenvolvedores, IAs ou arquitetos de software:

| Módulo | Descrição |
|--------|-----------|
| [01-architecture.md](./01-architecture.md) | Visão aprofundada, diagramas de fluxo e desenho de infraestrutura. |
| [02-database.md](./02-database.md) | Dicionário de dados, relacionamentos, schemas, policies e triggers. |
| [03-edge-functions.md](./03-edge-functions.md) | APIs Serverless, autenticação e fluxos de negócio. |
| [04-rpcs.md](./04-rpcs.md) | Procedimentos armazenados no PostgreSQL. |
| [05-tracking.md](./05-tracking.md) | Engrenagens do Meta Pixel, GA4, UTMs e Lead Scoring. |
| [06-analytics.md](./06-analytics.md) | Engine do Dashboard Executivo, KPIs e Materialized Views. |
| [07-security.md](./07-security.md) | JWT, Hardening, LGPD e RLS. |
| [08-financial-system.md](./08-financial-system.md) | Processamento de pagamentos, Asaas e Splits. |
| [09-sre.md](./09-sre.md) | Correlation IDs, Idempotência e Confiabilidade (DLQ). |
| [10-deployment.md](./10-deployment.md) | Fluxos de CI/CD, Cloudflare e checklists de deploy. |
| [11-development-guide.md](./11-development-guide.md) | Guia prático: padrões de código, convenções e tutoriais. |
| [12-troubleshooting.md](./12-troubleshooting.md) | Resolução de incidentes comuns e debug. |
| [13-roadmap.md](./13-roadmap.md) | Controle de Sprints, débitos técnicos e futuro. |
| [14-api-reference.md](./14-api-reference.md) | Referência completa das integrações internas e APIs. |
| [15-testing-guide.md](./15-testing-guide.md) | Diretrizes para QA, testes manuais e automatizados. |
| [16-operational-runbook.md](./16-operational-runbook.md) | Procedimentos operacionais para mitigação de crises e disaster recovery. |
| [17-decision-log.md](./17-decision-log.md) | Registro de Decisões Arquiteturais (ADRs). |
| [18-glossary.md](./18-glossary.md) | Dicionário de termos de negócios e técnicos. |

## 🛡 Princípios e Diretrizes

1. **O Código é a Fonte de Verdade:** Esta documentação deve refletir o código. Se divergir, o código predomina e esta documentação deverá ser atualizada no mesmo PR.
2. **Segurança First (Zero Trust):** Nenhuma query crítica deve ser feita no client. O client é inseguro. Confie apenas nas Edge Functions e no RLS do PostgreSQL.
3. **Idempotência é Lei:** Todos os processamentos financeiros e webhooks devem garantir segurança transacional matemática contra duplicações.

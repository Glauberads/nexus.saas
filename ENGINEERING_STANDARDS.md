# NexusSaaS Engineering Standards

Este documento estabelece as diretrizes fundamentais e inegociáveis para o desenvolvimento de software no ecossistema do **NexusSaaS**. Ele é a constituição técnica do projeto. Qualquer Engenheiro de Software, DevOps ou Inteligência Artificial atuando neste repositório **DEVE** ler e obedecer estritamente a estas regras antes de propor ou implementar código.

---

## 1. Filosofia do Projeto

Os princípios fundamentais que norteiam todas as decisões técnicas no NexusSaaS são:
- **Simplicidade (KISS):** A complexidade deve existir apenas no backend (BaaS/Database). O Frontend deve ser leve, simples e absurdamente rápido. Zero Over-engineering.
- **Performance de Conversão:** O LCP (Largest Contentful Paint) e o TTI (Time to Interactive) são as métricas de vida ou morte do negócio.
- **Segurança Default-Deny:** Confiança Zero (Zero Trust) em dados oriundos do cliente. Tudo deve ser sanitizado e restrito por RLS.
- **Observabilidade End-to-End:** Todo evento que altera estado financeiro ou de negócio precisa ser rastreável.
- **Escalabilidade Inteligente:** Pague apenas pelo que usa (Serverless Edge Functions) minimizando custos ociosos de infraestrutura.
- **Documentação Obrigatória:** A inteligência do negócio mora no código *e* na documentação (`/docs`). Código sem documentação é considerado dívida técnica e bloqueia o deploy.

---

## 2. Regras Arquiteturais

### Quando USAR:
- **Edge Functions:** Para lógica de negócios pesada assíncrona, integração com terceiros (Asaas, Meta), processamento de Webhooks, sanitização de PII e validações server-to-server.
- **RPC (Remote Procedure Calls):** Para agrupar complexidade transacional SQL em uma única chamada HTTP, e para permitir que o cliente leia dados protegidos pelo RLS via `SECURITY DEFINER`.
- **PostgreSQL / SQL:** Para relacionamentos, inserção direta de logs não-bloqueantes e gerenciamento de permissões (ACL).
- **Triggers:** Única e exclusivamente para auditoria de tabelas nativas ou gatilhos internos que garantem consistência de estado sem interação humana (ex: revogar licença no caso de estorno na tabela `refunds`).
- **Materialized Views:** Para agregar dados analíticos e popular Dashboards Administrativos sem estrangular a CPU do banco em tabelas transacionais (`events` ou `purchases`).
- **Frontend (Vanilla HTML/CSS/JS):** Para interface de renderização, captura de Tracking no DOM, armazenamento de Session/Local Storage e disparo inicial de conversão.

### Quando NÃO USAR:
- Não use **Frontend** para regras de negócio (cálculos de preço de checkout, regras de split, lógica de aprovação).
- Não use **Triggers** para disparos de e-mail ou envio de HTTP Requests (pode travar a transaction original se o provedor falhar). Use Edge Functions + Webhooks.
- Não use **Views Normais** para sumarizar meses de Analytics se houver travamento.

---

## 3. Padrões de Código

- **JavaScript (Vanilla):** Uso obrigatório de `async/await`, variáveis `const/let` bem escopadas, early returns, modularização por arquivo único e carregamento otimizado (Defer/Async) quando aplicável.
- **SQL:** Nomes em `snake_case`. Evite comandos não portáveis se houver alternativa genérica do Postgres. Comente triggers complexas.
- **HTML/CSS:** HTML Semântico (SEO Friendly), IDs amigáveis para tracking e automação, CSS baseado em classes utilitárias e variáveis nativas (CSS Custom Properties). Não utilize !important deliberadamente.
- **Supabase / Edge Functions:** Deno Typescript. Tipagem rigorosa nos payloads de webhooks. 
- **Naming Convention:**
  - Tabelas/Colunas/Arquivos SQL: `snake_case` (ex: `webhook_logs`).
  - Funções JS/TS e Edge Functions: `camelCase` e `kebab-case` nos nomes dos arquivos (ex: `asaas-create-payment.ts`).
  - Eventos de Tracking: `PascalCase` (ex: `InitiateCheckout`).
- **Estrutura de Arquivos:** Respeite a árvore arquitetônica estabelecida. Todo novo módulo Backend deve viver como `supabase/functions/modulo-nome`, e DB changes em `sql/YYYY_MM_DD_modulo.sql`.

---

## 4. Banco de Dados

- **Novas Tabelas:** Obrigatoriamente com PK `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` e `created_at TIMESTAMPTZ DEFAULT NOW()`.
- **Novas Colunas:** Evite deleções destrutivas. Adicione colunas anuláveis (`NULL`) caso a tabela já esteja em produção populada.
- **Índices:** Colunas utilizadas em filtros frequentes (`WHERE email = ...`), ForeignKey lookups ou Unicidade (Idempotência) DEVEM possuir índices B-Tree ou Hash.
- **RLS (Row Level Security):** OBRIGATÓRIO `ENABLE ROW LEVEL SECURITY` em **toda** tabela criada.
- **Policies:** Nunca confie no client. Use roles do auth.jwt para restringir Select/Update. 
- **RPCs:** Sempre travar o search path com `SECURITY DEFINER SET search_path = public`.
- **Migrações:** Alterações em produção NUNCA devem ser feitas manualmente. Gerar sempre um arquivo `.sql` iterativo e documentado.

---

## 5. Segurança

Regras obrigatórias de Segurança da Informação:
1. **Nunca expor secrets:** Chaves de API (ex: Asaas) nunca devem residir no Frontend.
2. **Nunca usar `USING(true)` em tabelas sensíveis:** Ao menos que a tabela precise ser lida globalmente por deslogados sem risco financeiro ou de privacidade.
3. **Sempre validar admin:** Ao modificar registros sistêmicos, confirme que o usuário porta os claims corretos.
4. **Sempre sanitizar payloads:** Prevenção contra Injections no Node/Deno e SQL.
5. **Sempre mascarar PII:** Dado sensível da LGPD (e-mail, CPF, fone) deve sofrer hash SHA-256 no log externo de CAPI e estar protegido por RLS agressivo no banco.

---

## 6. Performance

- **Evitar N+1:** Queries no PostgreSQL via Supabase devem utilizar Joins via SDK (`table_a(..., table_b(...))`) em vez de fetch iterativo no frontend.
- **Priorizar RPC:** Em cálculos complexos e manipulações agregadas.
- **Frontend Leve:** JS não bloqueante. Nenhuma API Third-party deve ser chamada no loop de render crítico.
- **Cache Local:** Reduza chamadas ao banco armazenando parâmetros (UTMs, Scores) no `localStorage`.

---

## 7. Observabilidade

Todo novo módulo Edge/Backend deve possuir:
- **Logs descritivos:** Nível de Warning para anti-fraude, Info para fluxo normal e Error para falhas try/catch.
- **Correlation ID:** Passado desde o Frontend até o último insert no SQL para debug contínuo.
- **Tratamento de erro:** Nenhum Edge Crash 500 não-tratado deve vazar pro client (stack trace isolation).
- **Monitoramento de Falhas (SRE):** Interações críticas devem ser escoadas para uma Dead Letter Queue (`DLQ`) caso o processamento morra no caminho.

---

## 8. Tracking

O oxigênio do sistema é a inteligência de marketing.
- O Frontend e o Motor de Tracking usam `dataLayer` como *Message Broker*.
- Todo novo fluxo de usuário (ex: Upsell, Novo Formulário) deve obrigatoriamente chamar `NexusTracker.track()` com os parâmetros padronizados.
- Não dispare Pixel ou GA4 diretamente via `<script>`. Deixe o `tracking.js` e o GTM orquestrarem. Sem duplicidade.

---

## 9. Analytics

Toda nova funcionalidade criada requer um assessment de dados:
- Informar no PR ou documentação quais KPIs executivos a funcionalidade afeta.
- Atualizar as Materialized Views se a nova tabela precisar refletir nos relatórios.
- Assegurar que o Dashboard Administrativo possa ler os novos indicadores.

---

## 10. Testes

Nenhuma feature ou Hotfix atinge estado de prontidão (Ready) sem:
1. **Teste Manual:** Executar todo o funil do usuário numa aba anônima (do Clique até a Confirmação do Pagamento Mockado).
2. **Teste de Integração:** Validar se os Webhooks do parceiro estão sendo processados corretamente.
3. **Teste de Segurança:** Certificar que um usuário "anon" não consegue alterar a propriedade "access_granted" burlando o RLS.
4. **Teste de Regressão:** Garantir que a nova feature não derrubou o módulo de assinaturas anterior.

---

## 11. Pull Requests (Checklist)

Para cada união de código:
- [ ] O código introduz novas tabelas? O arquivo SQL com RLS foi adicionado?
- [ ] Novas dependências na documentação (`/docs`) foram atualizadas?
- [ ] Os scripts de frontend mantêm o padrão Vanilla leve e responsivo?
- [ ] O `correlation_id` está fluindo para a nova API?
- [ ] Foram adicionados secrets nas variáveis de ambiente? (Sem versioná-los).

---

## 12. Deploy (Checklist)

Ao jogar em produção:
- [ ] Certifique-se de realizar Deploy do SQL (Migrations) ANTES do Deploy das Edge Functions.
- [ ] Deploy das Edge Functions ANTES do Frontend (Cloudflare).
- [ ] Validar health-check inicial pós-deploy (verificar se LP carrega em HTTPS).
- [ ] Testar uma conversão PIX real no CAPI (Gerenciador de Eventos Meta).

---

## 13. Definition of Done (DoD)

Uma tarefa **SÓ** é considerada concluída quando o seguinte ciclo for fechado:
- O **Código** funciona em Produção sem quebrar regressões.
- Os **Testes** manuais de integração de pagamento passaram em Staging.
- A **Documentação** (`/docs` e `.md` root) foi alterada para refletir a nova realidade.
- O **Contexto (NEXUSSAAS_CONTEXT.md)** reflete o novo fluxo.
- O **Roadmap** foi atualizado.
- O registro foi feito nos **ADRs** (se for uma escolha arquitetural) e no **Runbook**.
- O impacto foi catalogado no **Analytics** e o motor de **Tracking** foi engatilhado.
- As revisões de **Segurança (RLS)** passaram na checagem final.

---

## 14. Princípios Inegociáveis

NENHUM Desenvolvedor Sênior ou IA geradora de código pode quebrar estas regras absolutas:
1. **Nunca criar código duplicado:** Lógicas recorrentes viram RPCs ou Singleton functions.
2. **Nunca ignorar o RLS:** A tabela PostgreSQL que expuser dados via API sem policy receberá veto de produção imediato.
3. **Nunca criar funcionalidades sem documentação:** Se não está em `/docs`, não existe ou é dívida técnica proibitiva.
4. **Nunca quebrar compatibilidade arquitetural:** Não tente injetar Next.js numa Landing Page de ultra-performance de vendas construída em Vanilla se não houver um ADR votado autorizando isso.
5. **Nunca remover logs críticos:** Os logs da DLQ e do Correlation ID devem permanecer intocáveis.
6. **Nunca alterar rastreamentos (Tracking) sem atualizar o Analytics e GTM.**
7. **Nunca alterar estrutura do Banco de Dados sem um arquivo `.sql` versionável e aplicável.**
8. **Nunca criar endpoints (Edge Functions) sem validação/autenticação adequada (CORS e Headers restritos).**

---

## 15. Nota de Maturidade da Engenharia NexusSaaS

### Nível Atual: **Senior - High Performance (Tier B+)**

**Práticas Atendidas com Excelência:**
- Isolamento de Frontend e Backend (Zero trust pattern).
- Carga de Tracking e SEO nativamente injetados por Datalayer.
- Idempotência contra falhas concorrentes de Gateway Financeiro.
- Isolamento em Edge Functions (Resiliência SRE).
- Documentação exaustiva e Single Source of Truth configurada.

**Pontos de Evolução (Necessários para alcançar Tier A/S):**
- **Testes Unitários Automatizados:** O Nexus carece de Jest/Deno Tests automatizados rodando em Pipeline CI/CD na fase de commit (Testes ainda são estritamente manuais E2E).
- **Fallback e Gateways Resilientes:** O módulo financeiro precisa finalizar a orquestração "Multi-gateway" na tabela para aprovar no Stripe quando o Asaas recusa.
- **Infrastructure as Code (IaC):** O Setup inicial de um novo clone/instância do banco de dados ainda envolve scripts manuais invés de um gerenciador completo (ex: Terraform).

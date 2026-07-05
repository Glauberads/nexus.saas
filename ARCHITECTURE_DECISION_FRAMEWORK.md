# Architecture Decision Framework

O **Architecture Decision Framework** (ADF) é o documento normativo que rege COMO decisões estruturais, adoção de novas tecnologias e modificações de infraestrutura devem ser processadas no ecossistema do **NexusSaaS**. 

Nenhuma mudança arquitetural relevante poderá ser tomada de forma impulsiva, unilateral ou inconsistente sem ser submetida a este framework obrigatório.

---

## 1. Objetivo

O objetivo deste framework é garantir que toda decisão arquitetural seja embasada em **critérios puramente técnicos e de negócios**, evitando as armadilhas do *Hype Driven Development* (desenvolvimento guiado por modismos), intuições impulsivas ou inconsistências que degradem a manutenibilidade a longo prazo.

Toda mudança deve resolver um problema real de forma mensurável e justificável.

## 2. Processo de Decisão

Qualquer proposta que altere a arquitetura (Ex: adoção de um novo ORM, troca de provedor de filas, novo Gateway) deverá seguir obrigatoriamente este pipeline linear e sequencial:

1. **Contexto:** Qual é o cenário atual do sistema.
2. **Problema:** Qual dor técnica ou de negócio estamos tentando resolver.
3. **Alternativas:** Levantamento de ao menos 2 caminhos distintos.
4. **Análise Técnica:** Viabilidade de implementação na stack atual (Vanilla/Supabase).
5. **Análise Financeira:** Custos de licenciamento, tráfego ou infraestrutura.
6. **Impacto:** O que quebra se implementarmos isso?
7. **Riscos:** Possíveis falhas de segurança ou disponibilidade.
8. **Plano:** Step-by-step de como a mudança será executada.
9. **Validação:** Como garantiremos que a solução funciona (Testes).
10. **Implementação:** A execução do código em si.
11. **Revisão:** Análise pós-deploy avaliando se o problema foi, de fato, resolvido.

## 3. Checklist Arquitetural

Antes de formular a proposta formalmente, o Engenheiro ou IA deve responder categoricamente a este checklist para evitar reinvenção da roda:

- [ ] O problema relatado **realmente** existe em métricas ou é apenas hipotético?
- [ ] Já existe uma solução parcialmente implementada no sistema?
- [ ] Existe código no repositório reutilizável que solucione o problema?
- [ ] Existe uma Stored Procedure (RPC) no PostgreSQL que resolve isso sem mudar arquitetura?
- [ ] Existe uma Edge Function equivalente já estruturada no Supabase?
- [ ] Existe uma integração semelhante já ativa?
- [ ] Já existe um padrão documentado no `/docs` para tratar esse caso?

## 4. Critérios de Avaliação

Se o checklist confirmar a necessidade de mudança, a solução proposta deverá ser avaliada por meio de 12 prismas fundamentais:

1. **Segurança:** Aumenta a superfície de ataque? Respeita o RLS?
2. **Performance:** Aumenta o tempo de carregamento da página final (LCP)?
3. **Escalabilidade:** Suporta multiplicar os acessos por 10x sem gargalar?
4. **Confiabilidade:** O que acontece se o serviço terceiro falhar temporariamente?
5. **Financeiro:** O custo escala linearmente com os usuários? 
6. **Tracking:** Obstrui ou duplica os fluxos vitais do Meta/GTM?
7. **Analytics:** Quebra os dashboards corporativos que leem a Materialized View?
8. **Observabilidade:** Consegue manter o tráfego do `Correlation ID`?
9. **LGPD:** Dados de PII estão expostos de forma irreversível?
10. **Retrocompatibilidade:** A V1 continua rodando enquanto a V2 é implementada?
11. **Complexidade:** Traz dependências monolíticas indesejadas?
12. **Manutenibilidade:** É documentável? Um Dev Júnior entenderia a fundação em 1 semana?

## 5. Matriz de Impacto

Toda decisão arquitetural afeta o ecossistema. Classifique rigorosamente o nível de impacto (Baixo, Médio, Alto ou Crítico) nos seguintes eixos antes da aprovação:

- **Banco de Dados:** (Estrutura, chaves, performance SQL, custos de I/O)
- **Frontend:** (Bundle size, Vanilla script, SEO)
- **Backend:** (Edge Functions e latência de processamento)
- **Tracking:** (GTM, Pixel, Loss de Conversão)
- **Analytics:** (Gráficos, KPIs do Executivo)
- **Financeiro:** (Processamento Asaas, Split e Gateways)
- **Admin:** (Área logada do dono do SaaS)
- **Cliente:** (Interface do visitante ou comprador)
- **Documentação:** (Esforço para atualizar o repositório `/docs`)
- **SRE:** (Dificuldade de acionar o Disaster Recovery ou Failovers)

## 6. Critérios para Aprovação

O comitê (Humano + Leads) utilizará o seguinte guia para avançar com a adoção arquitetural:

- **Aprovada:** A decisão passa na Matriz de Impacto sem quebrar integrações, possui plano de rollback exato, não degrada a Performance/LCP e mantém o custo operacional alinhado.
- **Precisa de Revisão:** A decisão soluciona o problema, porém introduz dívida técnica inaceitável, ou afeta o motor de Tracking CAPI severamente sem medidas de mitigação desenhadas.
- **Rejeitada:** A decisão rompe com a Filosofia do Projeto (ex: introduzir React e causar lentidão na Landing Page), ignora vulnerabilidades de Segurança (bypassing do RLS injustificado) ou não resolve um problema matemático/métrica real provada.

## 7. Registro da Decisão (ADR)

Toda decisão **aprovada e executada** deverá, OBRIGATORIAMENTE, ser imortalizada. Nenhuma adoção passa sem gerar um ADR (Architecture Decision Record) para o arquivo `17-decision-log.md`. 

**Modelo Padrão de ADR:**
```markdown
### ADR XXX: [Título Curto e Direto da Adoção]
- **Data:** YYYY-MM-DD
- **Contexto:** Resumo claro e objetivo da situação atual.
- **Problema:** A dor técnica ou limitante.
- **Alternativas Consideradas:** [Alternativa A, Alternativa B].
- **Decisão:** O que escolhemos.
- **Consequências (Prós/Contras):**
  - Ganhos mensuráveis.
  - Trade-offs assumidos e débitos futuros conscientes.
```

## 8. Pós-Implementação

O processo não acaba no Deploy. Um checklist de validação é mandatório para decretar sucesso:

- [ ] A métrica que originou o "Problema" melhorou substancialmente?
- [ ] O Log Centralizado do Supabase apresenta ausência de erros (5xx) atípicos após a mudança?
- [ ] As vendas (Financial) estão batendo sem duplicidade na camada banco vs Gateway?
- [ ] Nenhuma lentidão reportada na interface do Cliente Final?
- [ ] Todos os novos fluxos estão cobertos pelo RLS?

## 9. Lições Aprendidas

Três semanas após a execução total, a equipe ou Inteligência encarregada deve criar um processo de Post-Mortem resumido, caso tenha havido atrito no deploy.
- Registrar no `12-troubleshooting.md` se essa mudança gerar novos padrões de travamento.
- Atualizar o Runbook se ferramentas antigas ficarem obsoletas.
- Este processo visa **evitar a repetição empírica de erros**, garantindo evolução contínua da capacidade do time de engenharia.

## 10. Filosofia Final

A arquitetura do **NexusSaaS** é viva e deve evoluir continuamente. No entanto, ela deve fazê-lo **preservando a simplicidade estrutural, a segurança em nível militar, o desempenho de milissegundos, a observabilidade cristalina e a sustentabilidade técnica a longo prazo.**

Nenhuma pressão de negócio, prazo apertado ou tendência da indústria ("hype") deve ser aceito como justificativa para corromper esses cinco pilares intrínsecos à vida da plataforma.

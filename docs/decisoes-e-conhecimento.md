# Decisões e conhecimento do projeto — Produto Hub (KMM4/KMM5)

Este documento consolida o contexto de negócio, as decisões de arquitetura e o estado atual da
implementação, para qualquer pessoa (ou agente) que entre neste repositório depois. Complementa o
`README.md` (que foca em "como rodar"); aqui o foco é "por que decidimos isso" e "o que já existe".

---

## 1. Objetivo do projeto

Aplicação web para consolidar informações, alertas e controles hoje feitos manualmente por
PM/Product Ops/POs do time de Produto da nstech. O time cuida de dois produtos — **KMM4** e
**KMM5** — com o mesmo fluxo e as mesmas ferramentas de rotina.

Requisitos funcionais originais (definidos pelo Heder, Head de Produto):
- Solução web publicada para o time interno, com acesso liberado por autenticação
- **API-first e agentizada** — outras aplicações e agentes devem conseguir consumir os mesmos dados
- Consumir dados do **Azure DevOps** do time
- Indicadores, relatórios, exportação de **OPR em PDF** e **alertas por e-mail**
- Código-fonte versionado no **GitHub**

## 2. Contexto de negócio e fontes de conhecimento

- Torre de Produto MG cuida de KMM4, KMM5 e produtos adjacentes (LTL, Cabotagem, Torre de
  Controle, Ecossistema/TNS), com ritos periódicos de OKR (FUP de Objetivos) documentados em:
  - OneDrive/SharePoint: site `kmm.ProdutoMG` → *Documentos Compartilhados/FUP Objetivos*
    (contém uma pasta `memoria/` já estruturada com índice de OKRs, decisões e riscos)
  - OneDrive pessoal do Heder: *Fluxos NS Tech/Produto/SH e Objetivos/FUP - Estrategia Produto (VP)*
- Esses FUPs são a fonte de "objetivos/OKRs" do time; este app cobre a camada de **indicadores
  operacionais de backlog/aging**, que é um recorte diferente e mais granular.

## 3. Ativos existentes reaproveitados

| Ativo | O que é | O que foi feito |
| --- | --- | --- |
| `painel-indicadores-kmm.jsx` | Artifact React do Heder com o painel real de indicadores KMM4/KMM5 (aging por categoria, fluxo de demandas, backlog em esteira, snapshots, entrada manual, CSV, geração de OPR em PDF client-side) | Portado quase 1:1 para `components/PainelIndicadores.jsx` neste repo — única mudança foi a persistência (ver decisão de dados compartilhados abaixo) |
| `roadmap-panel` (repo anterior do Heder) | FastAPI + React/Vite + Docker + AWS ECS, com integração Azure DevOps (WIQL) | **Não reaproveitado** — decisão explícita de começar repositório novo (ver decisões abaixo). Serviu de referência para o cliente Azure DevOps (`lib/devops-client.ts`) |

## 4. Decisões de arquitetura

| Decisão | Escolha | Motivo / contexto |
| --- | --- | --- |
| Repositório | Novo, do zero (`produto-hub`) | Evitar dívida técnica herdada do `roadmap-panel` |
| Framework | Next.js 14 (App Router) + TypeScript | Frontend e API routes no mesmo repo; deploy nativo no Vercel |
| Hospedagem | **Vercel** | Heder pediu algo mais barato que AWS ECS para uma ferramenta interna |
| Banco + Auth | **Supabase** (Postgres + Auth) | Free tier generoso; Auth já suporta e-mail/senha hoje e provider Azure AD nativamente no futuro |
| Autenticação — fase 1 | **Allowlist de e-mail** | Simples de operar agora, decisão explícita do Heder |
| Autenticação — fase 2 (futura) | **Azure AD / Entra ID** via Supabase Auth | Heder confirmou que é o destino, quando o time de TI liberar o app registration |
| PDF do OPR | `@react-pdf/renderer` (rota `/api/opr`, layout ainda placeholder) **+** geração client-side já existente no painel portado (html2canvas+jsPDF) | O painel original já resolvia isso no navegador; mantido como está. `/api/opr` é um segundo caminho server-side para relatórios fora do painel |
| E-mail de alertas | **Resend** | Barato, boa entrega; trocável por Microsoft Graph se migrar para M365 |
| Origem de dados operacional | Azure DevOps REST API (WIQL) via PAT | Mesmo requisito de escopo (Work Items → Read) já identificado no `roadmap-panel` |
| Agentização | Servidor MCP em `/api/mcp` (`@modelcontextprotocol/sdk`), chamando as mesmas funções de `lib/` usadas pelas rotas REST | Evita duplicar lógica de negócio entre "app humano" e "agente" |
| **Persistência dos indicadores reais** | Trocada do storage do Artifact (isolado por navegador/usuário) para `PainelEstado` — uma linha compartilhada no Postgres, servida por `/api/painel-state` (GET/PUT) | Era o maior limite do artifact original: cada pessoa via só os próprios números. Isso é literalmente o problema que o projeto se propõe a resolver |
| **Motor de alertas — fonte de dados** | Suporta **as duas fontes, com regras separadas** (`AlertaConfig.fonte`: `PAINEL_MANUAL` ou `DEVOPS_AUTO`) | Os indicadores manuais do painel (`PainelEstado`) e o agregado automático do DevOps (`/api/indicadores`) são modelos de dado diferentes; decisão explícita do Heder foi suportar os dois |

| **Redesenho de navegação (2026-09-15)** | Sidebar com 3 módulos (Gestão de clientes, Roadmap e entregas, Alertas e avisos) + home "Gestão de indicadores"; seletor global KMM4/KMM5/Ambos no header | Heder trouxe 4 telas de referência com uma IA mais executiva (KPIs + tabela) do que a ferramenta de edição densa que já existia |
| **Gestão de clientes — fonte de dado** | Entrada manual, com **importação em lote via planilha Excel** (`/api/clientes/import`) | Decisão explícita do Heder — não existe integração com CRM ainda |
| **Roadmap e entregas — fonte de dado** | **Extraído do Azure DevOps** (Epics/Features), progresso estimado pela proporção de itens-filho concluídos | Decisão explícita do Heder |
| **Tela de indicadores — edição vs. resumo** | As duas coisas coexistem: `/` é um resumo executivo (KPIs + tabela por categoria, somente leitura) e `/indicadores/editar` continua sendo o editor completo (`PainelIndicadores.jsx`, inalterado) | Decisão explícita do Heder: "manter a edição completa, essa tela é só um resumo por cima" |

## 5. Estado atual da implementação

```
app/
  page.tsx                        # renderiza components/PainelIndicadores.jsx
  api/
    painel-state/route.ts         # GET/PUT do estado compartilhado do painel (PainelEstado)
    devops/workitems/route.ts     # proxy WIQL para o Azure DevOps
    indicadores/route.ts          # agregado automático de aging/backlog via DevOps
    opr/route.ts                  # geração de OPR em PDF server-side (placeholder de layout)
    alerts/check/route.ts         # motor de alertas — lê PAINEL_MANUAL e/ou DEVOPS_AUTO conforme a regra
    mcp/route.ts                  # servidor MCP (tools: get_indicadores, listar_alertas_disparados)
components/
  PainelIndicadores.jsx           # painel real portado do artifact do Heder (client component)
lib/
  devops-client.ts, supabase.ts, auth-allowlist.ts, email.ts
middleware.ts                     # exige sessão Supabase (allowlist checada nas API routes)
prisma/schema.prisma              # PainelEstado, IndicadorSnapshot, AlertaConfig, AlertaDisparado, AllowedUser
```

**Ainda não implementado / placeholder:**
- `AREA_PATH_POR_PRODUTO` duplicado em `app/api/indicadores/route.ts` e `app/api/roadmap/route.ts` usa placeholders (`SeuProjeto\KMM4` / `SeuProjeto\KMM5`) — precisa do Area Path real do projeto Azure DevOps
- Layout do PDF em `/api/opr` é funcional mas não segue o branding KMM (Barlow, laranja FF3D03)
- Nenhuma UI de administração para `AlertaConfig` ainda — hoje seria gerenciada direto no banco (Supabase Studio) até existir uma tela própria
- "Aging médio" no resumo de indicadores (`/`) é uma **estimativa** a partir do ponto médio de cada faixa de aging (o painel guarda contagem de itens por faixa, não o valor bruto de cada item) — documentado no código, mas vale confirmar com o Heder se essa aproximação é aceitável ou se vale a pena passar a guardar os valores brutos
- Progresso do roadmap é calculado por proporção simples de itens-filho concluídos — não usa Story Points/Effort (ver TODO em `lib/devops-client.ts`)

## 6. Pendências / acessos necessários do Heder

- [x] PAT do Azure DevOps criado e testado com sucesso via `scripts/test-devops.mjs` (KMM4: 2132 work items ativos; KMM5: 7122) — org, PAT, projetos e Area Paths confirmados corretos
- [x] Projeto Supabase criado e configurado (URL + chaves no `.env`); migração aplicada; login (magic link) testado de ponta a ponta em 2026-09-19 — app roda localmente sem erros (home, menu lateral e `/indicadores/editar`)
- [ ] Conta Resend (ou domínio verificado para envio de e-mail)
- [x] Repositório GitHub de destino definido: `nstech/produto-hub`. Git local inicializado e remote `origin` configurado — **primeiro commit ainda não feito**, a pedido do Heder (aguardando sinal para commitar)
- [x] Area Paths reais de KMM4 e KMM5 confirmados por Heder e implementados em `lib/devops-projetos.ts` (ver changelog 2026-09-19)
- [ ] Lista inicial de e-mails para a allowlist de acesso

## 7. Histórico de decisões

### Schema de snapshots + decisão de agendamento do JOB (mapeamento de conteúdo do PRD F01.01)

Com o bug de cross-project corrigido e re-verificado (KMM4 → item #16804, KMM5 → item #43894,
cada um com `System.TeamProject` correto) e os mapeamentos de campo confirmados, avançamos para
a modelagem de dados dos indicadores.

**Schema Prisma adicionado** (`prisma/schema.prisma`, ainda **sem migração aplicada**):

- `DemandaSnapshot`: granularidade por item (não agregada), uma linha por Product Backlog Item
  por captura. Campos: `produto`, `workItemId`, `cliente` (Custom.Cliente), `squad`
  (System.AreaPath), `state` (System.State), `dataAberturaProduto` (Custom.DataAberturaProduto),
  `createdDate` (System.CreatedDate), `closedDate` (Microsoft.VSTS.Common.ClosedDate — **ainda não
  confirmado contra um item fechado real**), `agingDias` (calculado na captura: hoje −
  dataAberturaProduto, só quando `state = Backlog`), `capturadoEm`, `origem`
  ("azure-devops-job" | "manual"). Índices por `[produto, capturadoEm]`, `[workItemId,
  capturadoEm]` e `[produto, state, capturadoEm]`.
- `JobExecucao`: log de cada rodada do JOB (status, itens capturados, erro).
- `JobConfig`: registro único (id "default") com `frequencia`, `horario`, `ativo`,
  `atualizadoEm`.

**Decisão de arquitetura — agendamento do JOB (REQ01.04):** Heder escolheu **cron fixo diário
simples**. O Vercel Cron continua definido em `vercel.json` com horário fixo (mudar o horário
real exige editar o arquivo e fazer redeploy). A interface de controle do JOB (AC-3) vai:
- Exibir `frequencia`/`horario` de `JobConfig` em modo **somente leitura** (não edita o cron de
  fato).
- Permitir alternar `ativo` (kill-switch real, verificado pelo JOB antes de rodar — isso não
  depende de redeploy).
- Ter um botão "Executar agora" que chama a mesma rotina do JOB sob demanda, independente do
  cron.

**Pendências decorrentes:**
- Rodar `npx prisma migrate dev --name add-demanda-snapshot` (o ambiente de device bridge não
  tem rede liberada para o CDN de binários do Prisma nem para o Supabase — precisa ser rodado
  localmente por Heder, como já era o padrão estabelecido).
- Confirmar `Microsoft.VSTS.Common.ClosedDate` contra um item realmente fechado.
- Implementar o JOB de captura (rota + lógica de agregação/aging), a rota/lógica de "Executar
  agora", a UI de controle do JOB, a UI de entrada manual de histórico, e os três painéis
  (Fluxo de demandas, Aging de Viabilidade, Backlog de Viabilidade) com os filtros
  Data/Cliente/Squad.
 (changelog)

- **2026-09-15** — Kickoff do projeto. Levantado o contexto (time, produtos, fontes FUP no
  OneDrive/SharePoint) e identificados os ativos existentes (`painel-indicadores-kmm`,
  `roadmap-panel`). Proposta inicial de arquitetura apresentada.
- **2026-09-15** — Heder decide: repositório novo (não reaproveitar `roadmap-panel`); autenticação
  fase 1 por allowlist de e-mail (Azure AD fica para depois); hospedagem em Vercel (mais barato que
  AWS). Scaffold inicial gerado com Next.js + Supabase + Resend + MCP.
- **2026-09-15** — Heder envia o código real do artifact `painel-indicadores-kmm.jsx`. Componente
  portado para `components/PainelIndicadores.jsx`, trocando a persistência por navegador por
  `PainelEstado` compartilhado no Postgres.
- **2026-09-15** — Heder decide: o motor de alertas deve suportar as duas fontes de indicador
  (painel manual e agregado automático do DevOps), com regras separadas. Implementado o campo
  `AlertaConfig.fonte` e a lógica de resolução por fonte em `/api/alerts/check`.
- **2026-09-15** — Implementada a tela de login (`/login`): magic link (passwordless) via
  Supabase Auth, com envio condicionado à checagem da allowlist (`isEmailAllowed`) — mesma
  resposta ao usuário exista ou não o e-mail cadastrado, para não vazar quem tem acesso.
  Adicionado o callback do link (`/auth/callback`) e liberadas essas rotas no `middleware.ts`.
  Isso desbloqueia rodar a aplicação localmente de ponta a ponta.
- **2026-09-15** — Heder trouxe 4 telas de referência com um redesenho de navegação (sidebar +
  seletor global de produto KMM4/KMM5/Ambos) e dois módulos novos. Decisões: Gestão de clientes é
  manual com importação por Excel; Roadmap e entregas vem do Azure DevOps (Epics/Features); a tela
  de indicadores atual (edição completa) é mantida, e a nova home (`/`) vira um resumo executivo
  por cima dela. Implementado: `AppShell`/`ProdutoContext` (shell e seletor de produto),
  `app/(app)/page.tsx` (resumo de indicadores), módulo de clientes completo (model `Cliente`,
  CRUD, importação Excel via `xlsx`), módulo de roadmap (`getRoadmapItems` no cliente DevOps,
  progresso estimado por itens-filho concluídos), e o feed unificado `/api/avisos` (alertas
  disparados + informativos de roadmap) consumido pela tela "Alertas e avisos" reformulada com
  severidade (Crítico/Atenção/Informativo) — novo campo `AlertaConfig.severidade`.

- **2026-09-19** — Continuidade do projeto retomada após troca de conta. Reconferido o estado real
  da pasta local (`C:\Projetos\produto-hub`): o código do scaffold e a portagem do painel estão
  todos presentes, mas o repositório **ainda não tinha sido inicializado com git** e **não existia
  `.gitignore`** — divergência em relação ao changelog anterior (que registrava essa correção),
  possivelmente perdida na troca de conta. Criado `.gitignore` agora (ignora `node_modules/`,
  `.next/`, `.env*`, etc.) antes de qualquer `git init`/`git add`, já que `.env`/`.env.local` têm
  chaves reais do Supabase. Git ainda não inicializado — aguardando definição de nome/organização
  do repositório GitHub de destino.

- **2026-09-19** — Heder define o destino do repositório: `nstech/produto-hub`. Executado `git init
  -b main` e `git remote add origin https://github.com/nstech/produto-hub.git` na pasta local.
  A pedido explícito do Heder, **nenhum commit foi feito ainda** — apenas init + remote
  configurados, working tree com todos os arquivos untracked.

- **2026-09-19** — Heder cadastrou seu e-mail em `AllowedUser` pelo Supabase Studio e pediu para
  confirmarmos a tabela. Não foi possível consultar o Postgres/REST do Supabase a partir do shell
  local (sem acesso de rede geral — só os registries de npm/pip são alcançáveis daqui; DNS para
  `*.pooler.supabase.com` e `*.supabase.co` falha). Como verificação alternativa, rodado `npx tsc
  --noEmit` no projeto inteiro, que revelou e permitiu corrigir 3 bugs reais antes do primeiro teste
  local: (1) `app/api/opr/route.ts` continha JSX mas tinha extensão `.ts` — renomeado para
  `route.tsx`; (2) `middleware.ts` (exatamente o código que roda no fluxo de login) tinha os
  callbacks `get/set/remove` de cookies sem tipagem — anotados com `CookieOptions` de
  `@supabase/ssr`; (3) `NextResponse` em `/api/opr` recebia um `Buffer` do Node diretamente — trocado
  por `new Uint8Array(pdfBuffer)`. `npx tsc --noEmit` está limpo agora. Lembrete registrado para o
  teste do login: `lib/auth-allowlist.ts` compara `email.toLowerCase()`, então o e-mail salvo em
  `AllowedUser` precisa estar em minúsculas para bater.

- **2026-09-19** — Heder rodou `npm run dev` e testou o login com sucesso (o cadastro em
  `AllowedUser` funcionou), mas a tela inicial (`/`, via `AppShell`) quebrou com um React hydration
  error ("Text content does not match server-rendered HTML"), mostrando no diff o CSS de `FONTS`
  (import do Google Fonts + classes `.kmm-*`) com aspas escapadas como `&#x27;`. Causa: `FONTS` (em
  `lib/kmm-theme.ts`, duplicado em `components/PainelIndicadores.jsx`) é injetado como
  `<style>{FONTS}</style>` — como `<style>` é um elemento de "raw text" no HTML, o navegador não
  decodifica entidades no seu conteúdo, mas o React escapa `{FONTS}` como texto normal ao gerar o
  HTML no servidor; no cliente, ele compara com a string original (sem escapar) e o hydration falha.
  Corrigido nos 3 pontos onde isso acontecia — `components/AppShell.tsx` e as duas ocorrências em
  `components/PainelIndicadores.jsx` (estado de loading e o root) — trocando para
  `<style dangerouslySetInnerHTML={{ __html: FONTS }} />`. `npx tsc --noEmit` seguiu limpo depois da
  mudança. Padrão a observar: qualquer novo `<style>{algumaString}</style>` no projeto deve usar
  `dangerouslySetInnerHTML` pelo mesmo motivo.

- **2026-09-19** — Heder confirmou: rodou `npm run dev` de novo após a correção do hydration error e a tela inicial carregou sem o erro.

- **2026-09-19** — Heder confirmou que todas as abas (home, Gestão de clientes, Roadmap, Alertas, `/indicadores/editar`) abrem sem erro. Ambiente local considerado funcional de ponta a ponta. Próxima frente: configurar o PAT do Azure DevOps.

- **2026-09-19** — Heder informou os dados reais do Azure DevOps para configurar o PAT:
  organização `kmmbynstech` (https://dev.azure.com/kmmbynstech/). **Descoberta importante**:
  KMM4 e KMM5 são **dois projetos separados** dentro dessa organização (não um projeto único com
  dois Area Paths, como `AREA_PATH_POR_PRODUTO` assumia em `app/api/indicadores/route.ts` e
  `app/api/roadmap/route.ts`, e como `app/api/mcp/route.ts` também assumia com o mesmo placeholder
  `SeuProjeto\\KMM4`/`SeuProjeto\\KMM5`). Além disso, dentro de cada projeto existem vários
  times/Area Paths, e só uma parte interessa ao Hub:
  - **KMM4** (projeto `KMM4`): `KMM4\\TMS - Rangers`, `KMM4\\TMS - BeeSharp`,
    `KMM4\\TMS - Debitos Tecnicos`, `KMM4\\TMS - Melhorias`, `KMM4\\TMS - DreamTeam`,
    `KMM4\\TMS - Roadmap`, `KMM4\\TMS - EDI e Fast Track`
  - **KMM5** (projeto `KMM5`): `KMM5\\TMS - Dedicada Maroni`, `KMM5\\TMS - Dedicada Transben`,
    `KMM5\\TMS - Ecossistema`, `KMM5\\TMS - Melhorias`, `KMM5\\TMS - Migracao`,
    `KMM5\\TMS - Obrigacoes Legais e Financeiras`, `KMM5\\TMS - Projetos de Implantacao`,
    `KMM5\\TMS - Serviços da Carteira`

  Refatorado para refletir isso: criado `lib/devops-projetos.ts` com esse mapeamento produto →
  {project, areaPaths[]}; `lib/devops-client.ts` não lê mais `AZURE_DEVOPS_PROJECT` do ambiente —
  `queryWorkItems`/`getBacklogAtivo`/`getRoadmapItems` agora recebem o projeto como parâmetro
  explícito, e a filtragem por múltiplos Area Paths virou uma cláusula WIQL com OR
  (`([System.AreaPath] UNDER 'A' OR ... )`); `app/api/indicadores/route.ts`,
  `app/api/roadmap/route.ts` e `app/api/mcp/route.ts` atualizados para usar `DEVOPS_PROJETOS` em
  vez do placeholder `SeuProjeto\\KMM4`/`KMM5`; `app/api/devops/workitems/route.ts` (endpoint de
  debug WIQL ad-hoc) passou a exigir `project` no corpo da requisição, já que não há mais projeto
  único implícito; `.env.example` perdeu `AZURE_DEVOPS_PROJECT` (só `AZURE_DEVOPS_ORG` e
  `AZURE_DEVOPS_PAT` continuam necessários). `npx tsc --noEmit` limpo depois da mudança. PAT ainda
  não criado/preenchido no `.env` — próximo passo.

- **2026-09-19** — Heder criou o PAT do Azure DevOps (organização `kmmbynstech`, escopo Work Items →
  Read) e enviou o token. Preenchidos `AZURE_DEVOPS_ORG` e `AZURE_DEVOPS_PAT` em `.env` e
  `.env.local` (removida também a variável `AZURE_DEVOPS_PROJECT`, órfã desde a refatoração para
  `lib/devops-projetos.ts`). De passagem, encontrada e corrigida uma divergência entre os dois
  arquivos de ambiente: `.env` tinha `DIRECT_URL` apontando para o **session pooler**
  (`aws-0-us-west-2.pooler.supabase.com:5432`), enquanto `.env.local` ainda tinha a conexão
  **direta** antiga (`db.<ref>.supabase.co:5432`, que exige IPv6 — o mesmo problema de
  IPv6/Session pooler que o Heder tinha mencionado). Como a migração do Prisma já tinha rodado com
  sucesso usando `.env` (o Prisma CLI só lê `.env`, nunca `.env.local`), o valor de `.env` é o que
  funciona de fato — sincronizado para os dois arquivos.

  Não foi possível testar a conexão real com o Azure DevOps a partir do shell local (mesma
  limitação de rede já registrada para o Supabase — `dev.azure.com` também não resolve/conecta
  daqui). Criado `scripts/test-devops.mjs`, um diagnóstico standalone (roda com
  `node --env-file=.env scripts/test-devops.mjs`, sem precisar do Next.js) que consulta o total de
  work items ativos por produto usando os Area Paths de `lib/devops-projetos.ts` — serve pra
  confirmar de uma vez que ORG, PAT, nomes dos projetos e Area Paths estão todos corretos antes de
  usar isso nas telas reais. Pedido ao Heder rodar esse script e reportar o resultado.

- **2026-09-19** — Heder rodou `scripts/test-devops.mjs`: KMM4 (projeto "KMM4", 7 area paths) = 2132
  work items ativos; KMM5 (projeto "KMM5", 8 area paths) = 7122 work items ativos. PAT, organização,
  nomes de projeto e Area Paths confirmados corretos de ponta a ponta. Integração com Azure DevOps
  considerada configurada e funcional. Próxima frente: mapear o conteúdo/indicadores que devem ser
  exibidos em cada tela.

- **2026-09-19** — Heder enviou a PRD "F01.01 - Painel Indicadores" (documento de requisitos
  formal, não o template de PRD criado no Claude Docs). Resumo do escopo pedido:
  - **Pipeline de dados**: uma JOB diária (sem interação manual, mas com horário/frequência
    configurável via interface) que busca work items do tipo `Product Backlog Item` no Azure
    DevOps (KMM4 e KMM5) e persiste snapshots no Postgres, identificando a origem (KMM4/KMM5).
    Essa base local (não consulta ao vivo) passa a alimentar o painel principal. Também precisa de
    uma interface para entrada manual de dados históricos.
  - **Painel "Fluxo de demandas"**: gráfico de linha com Demandas Abertas/Encerradas/Canceladas ao
    longo do tempo (snapshot a snapshot), com toggle para ver cada série isolada e opção de agregar
    Encerradas+Canceladas. Data-base: Abertas usa `Created Date`; Encerradas e Canceladas usam
    `Closed Date`.
  - **Painel "Aging de viabilidade"**: `Aging` não existe no DevOps — calculado a cada carga como
    hoje − "Data Abertura Produto", recalculado só para itens com `State PBI` = "Backlog", exibido
    em dias (inteiro).
  - **Painel "Backlog de viabilidade"**: contagem de itens com `State PBI` = "Backlog" por mês,
    usando sempre o snapshot mais recente daquele mês (não soma nem faz média).
  - **Filtros da seção de indicadores operacionais**: Data (`Created Date`), Cliente, Squad
    (`Area Path` — já mapeado em `lib/devops-projetos.ts`).
  - **DoD/critérios de aceite**: dashboard com mais métricas além dessas 3 (Fluxo de demandas –
    Times dedicados, Backlog em esteira, Lead Time – EDI, Demandas prontas há mais de 30 dias, Lead
    Time de Entregas) e aging por 4 etapas (Viabilidade, Execução, Delivery, Comercial/CS) — ainda
    não detalhados na PRD, prováveis próximas seções/versões do documento.

  **Bloqueio identificado antes de implementar**: a PRD usa "Cliente", "State PBI" e "Data Abertura
  Produto" como campos do work item, mas não sabemos se são campos padrão do Azure DevOps ou
  customizados do projeto KMM4/KMM5, nem seus reference names técnicos (necessários pra WIQL/API).
  Criado `scripts/inspect-devops-fields.mjs` (roda com `node --env-file=.env
  scripts/inspect-devops-fields.mjs`) que lista TODOS os campos de um `Product Backlog Item` real
  de cada projeto, pra identificar os nomes técnicos corretos antes de desenhar o schema/queries.
  Pedido ao Heder rodar e reportar a saída antes de seguir com a implementação.

- **2026-09-19** — Heder confirmou dois pontos sobre a PRD F01.01: (1) "State PBI" deve usar o
  campo padrão `System.State`, não `Custom.Etapa` — simplifica, é campo nativo do Azure DevOps,
  sem precisar de custom field; (2) confirmou que o work item #43894 pertence só ao projeto KMM5 e
  **não deveria** ter aparecido na consulta contra o projeto KMM4 — ou seja, o achado anterior era
  real, não um engano meu.

  **Causa raiz confirmada**: uma WIQL sem filtro de Area Path (só tipo de work item + projeto na
  URL) pode vazar item de outro projeto neste org do Azure DevOps — a URL por si só não garante o
  escopo. Corrigido em `lib/devops-client.ts`: `getBacklogAtivo` e `getRoadmapItems` agora incluem
  `[System.TeamProject] = '<project>'` explícito na WHERE, além da cláusula de Area Path que já
  existia (essas funções nunca tinham essa vulnerabilidade de verdade, porque sempre filtravam por
  Area Path — o vazamento só apareceu no script de diagnóstico avulso, que consultava só por tipo).
  `scripts/inspect-devops-fields.mjs` também corrigido para filtrar por `TeamProject` + Area Path.
  `npx tsc --noEmit` limpo. **Regra gravada para qualquer WIQL futura neste projeto: nunca confiar
  só na URL do projeto — sempre incluir `[System.TeamProject]` e/ou Area Path explícito na WHERE.**

  Mapeamento de campos da PRD confirmado:
  - Cliente → `Custom.Cliente`
  - Data Abertura Produto → `Custom.DataAberturaProduto`
  - State PBI → `System.State` (não é campo customizado)
  - Squad → `System.AreaPath` (já usado em `lib/devops-projetos.ts`)
  - Data (filtro geral) → `System.CreatedDate`

- **2026-09-19** — Reexecutado `scripts/inspect-devops-fields.mjs` já com o filtro de
  `TeamProject` + Area Path: agora cada projeto retorna um item que realmente pertence a ele (KMM4
  → item #16804, `System.TeamProject = KMM4`; KMM5 → item #43894, `System.TeamProject = KMM5`) —
  confirma que a correção do vazamento entre projetos funcionou. Heder decidiu: **"State PBI" usa o
  campo padrão `System.State`, não `Custom.Etapa`** (os dois existem e têm valores diferentes no
  item de exemplo — `System.State = "Execução"` vs `Custom.Etapa = "Validação interna"` — mas
  `System.State` é o campo certo). Mapeamento de campos da PRD F01.01 fechado:
  - Cliente → `Custom.Cliente`
  - Data Abertura Produto → `Custom.DataAberturaProduto`
  - State PBI → `System.State` (valores observados no org: "Backlog", "Execução"; DoD lista também
    "Viabilidade", "Delivery", "Comercial/CS" como etapas de aging)
  - Squad → `System.AreaPath`
  - Data (filtro geral / "Demandas Abertas") → `System.CreatedDate`
  - Closed Date ("Demandas Encerradas/Canceladas", RN02.05/06) → assumido `Microsoft.VSTS.Common.ClosedDate`
    (campo padrão do Azure DevOps) — **ainda não confirmado visualmente**, porque nenhum dos dois
    itens de exemplo estava fechado; verificar quando tivermos um item fechado à mão.

  **Nota**: o DoD da PRD cita mais métricas do que a seção 4 detalha até agora ('Fluxo de Demandas –
  Serviços', 'Fluxo de demandas – Times dedicados', 'Lead Time – EDI', 'Demandas prontas com mais
  de 30 dias', 'Lead Time de Entregas', aging por 4 etapas) — só 'Fluxo de demandas' (genérico),
  'Aging de viabilidade' e 'Backlog de viabilidade' estão especificados com requisito/regra de
  negócio até aqui. Presumindo que essas seções ainda vêm em versão futura da PRD.
### JOB de captura diária implementado (backend) + bug crítico encontrado no middleware

Migração `add_demanda_snapshot` aplicada com sucesso (confirmado por Heder via print do
`npx prisma migrate dev`). Implementado o backend do JOB de captura:

- `lib/devops-client.ts`: nova função `fetchPbisParaSnapshot(project, areaPaths)` — busca TODOS
  os "Product Backlog Item" de um produto (sem filtro de estado, histórico completo), via
  `wit/workitemsbatch` (POST) em lotes de 200 ids (limite da API), pedindo só os campos
  necessários (`System.State`, `System.AreaPath`, `System.CreatedDate`, `Custom.Cliente`,
  `Custom.DataAberturaProduto`, `Microsoft.VSTS.Common.ClosedDate`). Retorna também
  `possivelTruncamento: boolean` — true se a WIQL bateu no limite padrão de 20000 resultados da
  organização (ainda não confirmado se algum produto passa disso; o job registra aviso na
  execução se acontecer, sem falhar).
- `lib/job-captura.ts` (novo): `executarCaptura(origem)` — para cada produto em
  `DEVOPS_PROJETOS`, busca os PBIs, calcula `agingDias` (hoje − dataAberturaProduto, só quando
  `state = "Backlog"`) e grava em `DemandaSnapshot` via Supabase client (service role), em lotes
  de 500. Não decide sozinho se deve rodar — quem chama decide (kill-switch).
- `app/api/jobs/captura/route.ts` (novo): `GET` protegido por `CRON_SECRET` (chamado pelo Vercel
  Cron), checa `JobConfig.ativo` antes de rodar (pula se desativado). `POST` é o "Executar agora"
  da futura UI de controle — protegido pela sessão do middleware, ignora o kill-switch de
  propósito. Ambos registram início/fim em `JobExecucao` (status, itens capturados, erro).
- `vercel.json`: adicionado `{ "path": "/api/jobs/captura", "schedule": "0 11 * * *" }` — roda
  todo dia às 11:00 UTC (08:00 BRT), antes do cron de alertas (12:00 UTC / 09:00 BRT weekdays),
  para os painéis já lerem dado fresco quando os alertas rodarem.

**Bug crítico encontrado e corrigido:** o `middleware.ts` aplicava a checagem de sessão Supabase
em **todas** as rotas não listadas em `PUBLIC_PATHS` — incluindo `/api/alerts/check`, que já
existia e é chamada pelo Vercel Cron (sem sessão de usuário, só o header `Authorization: Bearer
CRON_SECRET`). Isso significa que o middleware redirecionava a chamada do Cron para `/login`
**antes** dela chegar na checagem de `CRON_SECRET` da própria rota — ou seja, o cron de alertas
nunca executava de fato. Corrigido adicionando `CRON_GET_PATHS` no middleware: só o método `GET`
nessas rotas específicas (`/api/alerts/check`, `/api/jobs/captura`) pula a checagem de sessão;
`POST` nelas continua exigindo sessão válida normalmente (usado pelo botão "Executar agora").

`npx tsc --noEmit` rodou limpo depois de todas essas mudanças.

**Pendências decorrentes:**
- Confirmar no Vercel se o plano atual permite 2 cron jobs diários (não verificado — busca na
  web bloqueada neste ambiente).
- Garantir que `CRON_SECRET` esteja configurado nas env vars do projeto no Vercel (não só
  local) — sem isso o cron de produção recebe 401 tanto em `/api/alerts/check` quanto no novo
  `/api/jobs/captura`.
- Rodar a primeira captura manualmente (via `POST /api/jobs/captura`, ainda sem UI) pra validar
  o fluxo ponta a ponta e conferir se `possivelTruncamento` acontece em algum produto.
- Construir a UI de controle do JOB (AC-3: histórico de `JobExecucao`, toggle de
  `JobConfig.ativo`, botão "Executar agora").
- Construir a UI de entrada manual de histórico (REQ01.06).
- Implementar os três painéis (Fluxo de demandas, Aging de Viabilidade, Backlog de Viabilidade)
  e os filtros Data/Cliente/Squad, consumindo `DemandaSnapshot`.

### UI de controle do JOB (AC-3) + 2º bug encontrado (atualizadoEm sem default no banco)

Implementada a interface de controle do JOB, pulando o teste manual isolado (Heder optou por ir
direto pra UI):

- `app/api/jobs/config/route.ts` (novo): GET/PUT de `JobConfig`. Só o campo `ativo`
  (kill-switch) é de fato editável — `horario`/`frequencia` continuam informativos (decisão de
  cron fixo simples).
- `app/api/jobs/execucoes/route.ts` (novo): GET das últimas 20 linhas de `JobExecucao`, mais
  recente primeiro.
- `app/(app)/job/page.tsx` (novo): tela "JOB de captura" — mostra o agendamento fixo (todo dia
  08:00 BRT, com nota de que mudar exige redeploy), toggle de ativar/desativar (liga em
  `JobConfig.ativo`), botão "Executar agora" (chama `POST /api/jobs/captura`, ignora o
  kill-switch de propósito) e histórico de execuções com status/itens capturados/erro.
- `components/AppShell.tsx`: item de menu novo "JOB de captura" (ícone RefreshCw).
- `lib/kmm-theme.ts`: adicionado `.kmm-spin` (keyframe de rotação) pro ícone do botão "Executar
  agora" durante o carregamento.

**2º bug encontrado (mesma categoria do bug do middleware — código que não passa pelo Prisma
Client):** `atualizadoEm` é `@updatedAt` no schema Prisma, mas isso é um recurso só do Prisma
Client (setado em memória antes do INSERT/UPDATE) — **não existe DEFAULT nem trigger no banco**
para essa coluna (confirmado lendo o SQL das migrations: `"atualizadoEm" TIMESTAMP(3) NOT NULL`,
sem `DEFAULT`). Como `app/api/painel-state/route.ts` grava via Supabase client direto (não via
Prisma), o `PUT` que faz upsert da linha "default" de `PainelEstado` omitia `atualizadoEm` — na
1ª gravação (linha ainda não existente) isso quebra por violação de NOT NULL. Corrigido: o
upsert agora sempre passa `atualizadoEm: new Date().toISOString()` explicitamente. Apliquei o
mesmo cuidado desde já no upsert de `JobConfig`. Vale revisar se aparecer outro upsert
Supabase-direto de uma tabela com `@updatedAt` no futuro.

`npx tsc --noEmit` limpo depois de tudo isso.

**Pendências decorrentes (sem mudança em relação à entrada anterior, ainda de pé):**
- Confirmar `CRON_SECRET` nas env vars de produção do Vercel (Heder disse que ainda não
  configurou — bloqueia os dois crons em produção até isso ser feito).
- Confirmar limite de cron jobs do plano Vercel atual (2 crons diários) — não verificado.
- Rodar a 1ª captura real (agora dá pra fazer clicando em "Executar agora" na tela `/job`) e
  conferir se algum produto aciona o aviso de possível truncamento (>= 19999 itens).
- UI de entrada manual de histórico (REQ01.06) — ainda não iniciada.
- Os três painéis (Fluxo de demandas, Aging de Viabilidade, Backlog de Viabilidade) e os filtros
  Data/Cliente/Squad, consumindo `DemandaSnapshot` — ainda não iniciados.

### 3º bug (sistêmico): `@default(uuid())` não gera default no banco — "Executar agora" quebrou

Heder testou o botão "Executar agora" e recebeu: `null value in column "id" of relation
"JobExecucao" violates not-null constraint`.

**Causa raiz:** `id String @id @default(uuid())` no Prisma só gera o UUID dentro do Prisma
Client (em memória, antes do INSERT) — **não existe DEFAULT no Postgres** pra essa coluna
(confirmado no SQL: `"id" TEXT NOT NULL`, sem `DEFAULT`, em toda tabela exceto `JobConfig`
que usa `@default("default")`, um literal fixo). Como o projeto inteiro grava via Supabase
client direto (não via Prisma Client — decisão já documentada, ver `app/api/painel-state`), todo
`.insert()` que não passa `id` explicitamente quebra do mesmo jeito. Isso é a mesma categoria do
bug do `atualizadoEm` (2ª entrada acima) — recursos "automáticos" do Prisma que só existem se
quem grava é o Prisma Client.

**Varredura completa do código** achou 6 pontos afetados, todos corrigidos com
`id: randomUUID()` (de `crypto`, nativo do Node):
- `app/api/jobs/captura/route.ts` — insert em `JobExecucao` (o que gerou o erro reportado).
- `lib/job-captura.ts` — insert em `DemandaSnapshot` (ainda não tinha sido exercitado; teria
  quebrado na primeira captura real).
- `app/api/alerts/check/route.ts` — insert em `AlertaDisparado` (só ia quebrar quando o cron de
  alertas finalmente disparasse de verdade, depois do fix do middleware — não reportado ainda
  porque nenhum alerta dessa versão chegou a disparar).
- `app/api/clientes/route.ts` — insert de `Cliente` (cadastro manual de cliente).
- `app/api/indicadores/route.ts` — insert em `IndicadorSnapshot` (tirar "foto" dos indicadores).
- `app/api/clientes/import/route.ts` — upsert em lote de `Cliente` (importação via planilha).
  Nota: como o `id` agora é enviado em toda linha (necessário pro caminho de INSERT), um
  re-import de um cliente já existente também troca o `id` dele no `ON CONFLICT DO UPDATE` (nada
  hoje referencia `Cliente.id` como FK, então não quebra nada, mas vale saber).

`npx tsc --noEmit` limpo depois da correção. Heder ainda não confirmou se o "Executar agora"
funcionou após esse fix — próximo passo é ele testar de novo.

**Pendências decorrentes (sem mudança):**
- Confirmar `CRON_SECRET` nas env vars de produção do Vercel.
- Confirmar limite de cron jobs do plano Vercel atual.
- Reconfirmar o teste do "Executar agora" após este fix.
- UI de entrada manual de histórico (REQ01.06).
- Os três painéis (Fluxo de demandas, Aging de Viabilidade, Backlog de Viabilidade) e os filtros
  Data/Cliente/Squad.

### Primeira captura real confirmada com sucesso

Heder rodou "Executar agora" de novo após o fix do `randomUUID()` e funcionou:
20/09/2026 18:32:36 · **1692 itens** · Sucesso, sem aviso de truncamento (bem abaixo do limite
de 20000 da WIQL).

Nota para referência futura: 1692 é a contagem de "Product Backlog Item" (KMM4+KMM5, todos os
estados). É bem menor que os ~9254 itens "ativos" que `test-devops.mjs`/`getBacklogAtivo`
contavam antes — porque aquela função conta **qualquer tipo de work item ativo** (Task, Bug,
Epic, etc.), sem filtrar por `WorkItemType`, enquanto a captura de snapshot filtra
especificamente `[System.WorkItemType] = 'Product Backlog Item'` (o escopo do PRD F01.01). Os
dois números medem coisas diferentes de propósito — não é inconsistência.

**Pipeline de captura (REQ01.02/03/04, AC-3) considerado concluído e validado ponta a ponta.**
Próximos itens do PRD, ainda não iniciados: UI de entrada manual de histórico (REQ01.06) e os
três painéis (Fluxo de demandas, Aging de Viabilidade, Backlog de Viabilidade) com os filtros
Data/Cliente/Squad.

### Painéis do dashboard implementados (Fluxo de demandas, Aging de Viabilidade, Backlog de Viabilidade)

Reli a seção 4 do PRD F01.01 na íntegra (protótipos + RN02.01 a RN02.11) antes de implementar.
Decisões tomadas:

- **Onde mora o dashboard:** Heder escolheu **substituir a home (`/`)**. O painel manual antigo
  (Viabilidade/Execução/Teste/Comercial, `PainelEstado`) continua existindo, só mudou de
  endereço visível: saiu da home e ganhou um item de menu próprio "Indicadores manuais"
  (`/indicadores/editar`, já existia como rota, só não tinha link no menu).
- **Granularidade dos 3 painéis: mensal**, consistente com o protótipo e com REQ02.07 (que já
  exige mês explicitamente pro Backlog de Viabilidade).
- **Fluxo de demandas (REQ02.02-06):** `lib/demandas-agregacao.ts` → `calcularFluxoDemandas`.
  "Abertas" conta por mês de `Created Date`; "Encerradas"/"Canceladas" por mês de `Closed Date`,
  usando o **último snapshot conhecido de cada item** (createdDate/closedDate não mudam depois
  de definidos, não precisa de histórico mês a mês pra isso). Página nova em
  `app/(app)/page.tsx`: gráfico de linha com chips pra isolar cada série (REQ02.03) e checkbox
  "Agregar Encerradas + Canceladas" (REQ02.04).
  **PROVISÓRIO:** a função `classificarEncerramento()` usa heurística por nome de estado
  (contém "cancel"/"remov" → cancelada; "closed"/"conclu"/"encerrad" → encerrada) até Heder
  rodar `scripts/inspect-devops-states.mjs` (pedido a ele, resposta pendente) e eu trocar isso
  pelas categorias reais (`Completed`/`Removed`) que a Azure DevOps atribui a cada estado
  customizado de KMM4/KMM5. Um estado não reconhecido fica de fora das duas séries (falha
  seguro: não classifica errado, só deixa de contar).
- **Aging de Viabilidade (REQ02.03-05/RN02.07-09):** `calcularAgingViabilidade` — média de
  `agingDias` por mês, só dos itens com `State = "Backlog"` no último snapshot daquele mês
  (aqui sim precisa do histórico mês a mês, porque o estado do item pode mudar ao longo do
  tempo). Exibido em dias inteiros (REQ02.05).
- **Backlog de Viabilidade (REQ02.06-08/RN02.10-11):** `calcularBacklogViabilidade` — contagem
  de itens `State = "Backlog"` no último snapshot de cada mês (implementa literalmente o
  exemplo do REQ02.08: se tem duas capturas no mesmo mês, só a mais recente conta).
- **Filtros operacionais (REQ02.01-03):** Data (intervalo, filtra por `Created Date`), Cliente e
  Squad — dropdowns alimentados pelos valores distintos já existentes em `DemandaSnapshot`
  (para o produto selecionado no switcher global KMM4/KMM5/Ambos).

**Nova rota `GET /api/demandas`** — devolve filtros (opções de cliente/squad), totais (Abertas/
Encerradas/Canceladas/Aging atual/Backlog atual) e as 3 séries mensais, tudo calculado a partir
de `DemandaSnapshot`.

**Risco de escalabilidade sinalizado (não resolvido ainda):** a agregação hoje é feita em
memória na própria rota (busca as linhas cruas do Supabase e reduz em JS), com um teto de
segurança de 50000 linhas. Com a captura diária gerando ~1700 linhas/dia, esse teto será
atingido em ~1 mês. Quando isso acontece, a API retorna `avisoVolume: true` e a tela mostra um
banner de aviso — não falha silenciosamente, mas os dados ficam incompletos (histórico mais
antigo cortado). **Antes de ~1 mês de captura acumulada, migrar a agregação pra dentro do
banco** (ex.: `SELECT DISTINCT ON (workItemId) ... ORDER BY workItemId, capturadoEm DESC`
exposta como função/view do Postgres, chamada via `supabase.rpc(...)`), que não tem esse teto.

`npx tsc --noEmit` limpo depois de tudo isso.

**Pendências decorrentes:**
- Heder rodar `scripts/inspect-devops-states.mjs` e eu trocar `classificarEncerramento()` pela
  categoria real de cada estado (ainda usando heurística provisória).
- Testar o dashboard novo no navegador (`npm run dev`, abrir `/`) — ainda não validado
  visualmente por Heder.
- Migrar a agregação pra SQL antes de ~1 mês de captura acumulada (risco de escalabilidade
  acima).
- UI de entrada manual de histórico (REQ01.06) — ainda não iniciada.
- Confirmar `CRON_SECRET` em produção no Vercel e limite de cron jobs do plano — ainda
  pendentes de confirmação por Heder.

### Ajustes pedidos por Heder após revisar os registros: origem, agingDias, campo Etapa, Detalhes

Heder olhou os dados gravados e pediu 4 mudanças:

1. **`origem` estava errado.** Guardava se a captura foi manual/automática ("manual" pra tudo,
   já que só rodamos via "Executar agora" até agora) — mas REQ01.06 pede que essa coluna
   identifique o **projeto de origem** (KMM4/KMM5). Corrigido: `lib/job-captura.ts` agora grava
   `origem: produto` (mesmo valor de `produto`, redundante de propósito, é o que foi pedido). A
   distinção manual/cron que existia em `origem` foi realocada pra
   `JobExecucao.tipo` (`captura-devops` vs `captura-devops-manual`) em
   `app/api/jobs/captura/route.ts`, pra não perder essa informação.
   **Dados já gravados (1692 linhas de 20/09) ficaram com `origem = "manual"` — não foram
   corrigidos automaticamente.** Pra arrumar os registros existentes, rodar no SQL Editor do
   Supabase: `UPDATE "DemandaSnapshot" SET origem = produto::text;`
2. **Regra de `agingDias` mudou.** Antes, item sem `dataAberturaProduto` ficava de fora do
   cálculo (aging = null). Agora: `SE dataAberturaProduto = nulo → agingDias = hoje −
   createdDate; SENÃO → hoje − dataAberturaProduto` (continua só pra `state = "Backlog"`).
   Atualizado em `calcularAgingDias()` (`lib/job-captura.ts`), que agora recebe `createdDate`
   como parâmetro extra.
3. **Campo novo `etapa`** (`Custom.Etapa` no Azure DevOps) adicionado em `DemandaSnapshot`
   (schema Prisma) e no JOB de captura: `CAMPOS_SNAPSHOT` (`lib/devops-client.ts`) e o mapeamento
   de linha (`lib/job-captura.ts`). **Migração ainda não aplicada** — falta Heder rodar
   `npx prisma migrate dev --name add_etapa_snapshot`.
4. **Botão "Detalhes" no painel Aging de Viabilidade.** Nova rota `GET
   /api/demandas/aging-detalhe` (mesmos filtros de Data/Cliente/Squad da tela) retorna os itens
   `State = "Backlog"` do snapshot mais recente de cada um — a mesma seleção usada pro "ATUAL" do
   painel — com workItemId, produto, cliente, squad, etapa e agingDias. O botão abre um modal com
   essa lista em tabela.

`npx tsc --noEmit` limpo depois de tudo isso.

**Pendências decorrentes:**
- Heder rodar `npx prisma migrate dev --name add_etapa_snapshot` (schema mudou, precisa
  migração).
- Heder rodar o `UPDATE` acima no Supabase pra corrigir o `origem` das 1692 linhas já
  capturadas (opcional — a próxima captura diária já vai gravar certo; é só pra não conviver
  com dado velho errado).
- Rodar "Executar agora" de novo depois da migração pra já vir com `etapa` preenchido.
- Confirmar visualmente o modal de Detalhes no navegador.
- Heder ainda não rodou `scripts/inspect-devops-states.mjs` (classificação de
  Encerrada/Cancelada segue provisória).
- Migrar a agregação de `/api/demandas` pra SQL antes de ~1 mês de captura acumulada.
- UI de entrada manual de histórico (REQ01.06).
- Confirmar `CRON_SECRET` em produção no Vercel e limite de cron jobs do plano.

### Filtro de Squad virou multi-seleção

Heder pediu (via print do dropdown de Squad) pra poder selecionar mais de um squad de uma vez —
faz sentido, várias combinações de squads da mesma área (ex.: "KMM4\\TMS - Rangers" +
"KMM4\\TMS - BeeSharp") podem precisar ser vistas juntas.

- `app/(app)/page.tsx`: `squad: string` virou `squads: string[]`; o `<select>` nativo virou um
  componente novo `MultiSelectSquad` (checkbox list num dropdown customizado, fecha ao clicar
  fora) — Cliente continua single-select por enquanto (não foi pedido pra ele).
- `app/api/demandas/route.ts` e `app/api/demandas/aging-detalhe/route.ts`: o filtro de squad
  passou de `?squad=X` (um valor) pra `?squad=X&squad=Y` (múltiplos, lidos com
  `params.getAll("squad")`) e a query no Supabase trocou de `.eq("squad", ...)` pra
  `.in("squad", squadsFiltro)`.

`npx tsc --noEmit` limpo.

**Pendências (sem mudança desde a entrada anterior):**
- Heder rodar `npx prisma migrate dev --name add_etapa_snapshot`.
- Rodar o `UPDATE` de correção do `origem` das 1692 linhas antigas (opcional).
- Rodar "Executar agora" de novo depois da migração.
- Confirmar visualmente o modal de Detalhes e o multi-select de Squad no navegador.
- Heder ainda não rodou `scripts/inspect-devops-states.mjs`.
- Migrar a agregação de `/api/demandas` pra SQL antes de ~1 mês de captura acumulada.
- UI de entrada manual de histórico (REQ01.06).
- Confirmar `CRON_SECRET` em produção no Vercel e limite de cron jobs do plano.

### Rearquitetura de leitura (DemandaAtual + DemandaMensal) + ajustes finos pedidos por Heder

Heder pediu 5 coisas na mesma mensagem; a #5 (performance) foi a mais estrutural e mudou como
os outros 4 itens foram implementados.

**1. Título do painel:** "Aging de Viabilidade" → "**Agging de Viabilidade**" (grafia do PRD),
no card e no título do modal de Detalhes. Só o texto de tela mudou — nomes internos de
função/campo (`calcularAgingViabilidade`, `agingDias`, etc.) continuam com "aging" mesmo, não
faz sentido levar o typo pro código.

**2. Cliente "KMM (INTERNO)" excluído do painel Agging de Viabilidade** (só desse painel — Fluxo
de Demandas e Backlog de Viabilidade continuam contando esse cliente normalmente). Constante
`CLIENTE_EXCLUIDO_AGING` em `lib/demandas-agregacao.ts`, aplicada em `calcularAgingViabilidade`
e nas rotas (`/api/demandas` pro "ATUAL", `/api/demandas/aging-detalhe` pro modal de Detalhes).
Cuidado técnico: a exclusão é feita em memória (filtro JS), não com `.neq()` no Supabase — um
`.neq()` no Postgres também exclui linhas com `cliente` nulo (`NULL <> 'x'` não é verdadeiro em
SQL), o que apagaria itens sem cliente preenchido.

**3. Botão "Salvar Filtros"** ao lado de "Limpar filtros". Salva cliente/squads/data numa linha
única compartilhada (`FiltroPainelIndicadores`, id "default" — mesmo padrão de
PainelEstado/JobConfig): rota nova `GET/PUT /api/demandas/filtro`. Ao abrir a tela, os filtros
salvos viram o ponto de partida (mesmo padrão pra todo o time, não é por usuário/navegador).

**4. Campos novos `descricao` (System.Title) e `classificacao` (Custom.Classificacao)** — este
último **assumido pelo padrão dos outros campos custom do org** (Cliente→Custom.Cliente,
Etapa→Custom.Etapa, todos "Custom.NomeSemAcento"), ainda não confirmado contra um item real.
Adicionados em `CAMPOS_SNAPSHOT` (`lib/devops-client.ts`) e nas 3 tabelas que o JOB grava.
`descricao` e `classificacao` também aparecem agora no modal de Detalhes do painel Agging.

**5. Rearquitetura de performance (o pedido mais substancial):** Heder relatou carga lenta na
tela e apontou que preencher retroativo não é viável do jeito atual. Causa raiz: `/api/demandas`
lia TODO o histórico bruto de `DemandaSnapshot` (que cresce ~1700 linhas/dia) e reduzia
"último snapshot por item" em memória a cada requisição — ia ficando mais lento a cada dia,
sem limite.

**Decisão: 2 tabelas de rollup novas, mantendo `DemandaSnapshot` como log bruto intocado**
(exatamente como Heder pediu: "mantenha a JOB... em DemandaSnapshot, mas crie uma rotina a mais
pra alimentar essa nova tabela"). Análise de 1 tabela vs. mais de 1:

- `DemandaAtual` — **1 linha por item** (upsert, chave = workItemId). Serve o painel **Fluxo de
  Demandas** por inteiro (histórico completo incluído: createdDate/closedDate de um item não
  mudam depois de definidos, então não precisa de nada "mês a mês" aqui) e as figuras "ATUAL" +
  o modal de Detalhes dos painéis de Agging/Backlog de Viabilidade.
- `DemandaMensal` — **1 linha por item + mês** (upsert, chave = workItemId+mes), só reescrita
  enquanto o mês corrente não vira. Serve o **histórico mensal** de Agging/Backlog de
  Viabilidade, que precisa saber "como estava o backlog naquele mês" — informação que
  `DemandaAtual` sozinha não tem, porque o estado de um item muda com o tempo.

Uma tabela só não dava pra cobrir os dois formatos sem redundância (Fluxo não precisa de
histórico mês a mês; Agging/Backlog precisam). Duas tabelas, cada uma do tamanho da sua real
necessidade: `DemandaAtual` fica sempre do tamanho da quantidade de itens (~1700, não cresce com
o tempo), `DemandaMensal` cresce ~1700 linhas/**mês** (30x mais devagar que o log diário atual).

`lib/job-captura.ts` foi reescrito: pra cada item capturado, grava 1 linha em `DemandaSnapshot`
(insert, como sempre), 1 upsert em `DemandaAtual` (chave workItemId) e 1 upsert em
`DemandaMensal` (chave workItemId+mês corrente). `lib/demandas-agregacao.ts` foi simplificado
(as funções de "pegar o mais recente" — `ultimoSnapshotPorItem`/`ultimoSnapshotPorItemEMes` —
saíram, porque as tabelas novas já vêm reduzidas por construção). `/api/demandas` e
`/api/demandas/aging-detalhe` foram reescritas pra ler das tabelas novas — o teto de segurança e
o aviso de truncamento (`avisoVolume`) da versão anterior **foram removidos**, porque não fazem
mais sentido: essas tabelas não crescem sem limite do mesmo jeito.

Sobre backfill retroativo: como observado por Heder, não tem como reconstruir `DemandaMensal`
pra meses passados a partir do Azure DevOps sem consultar o histórico de revisões de cada work
item (caro, não faz parte deste JOB). A tabela só começa a acumular histórico mensal a partir de
hoje em diante — preencher dados anteriores continua sendo o papel da interface de entrada
manual de histórico (REQ01.06, ainda não construída).

`npx tsc --noEmit` limpo depois de tudo isso.

**IMPORTANTE — migração pendente e acumulada:** o schema agora tem, sem migração aplicada ainda:
`etapa`/`descricao`/`classificacao` em `DemandaSnapshot`, os models `DemandaAtual`,
`DemandaMensal` e `FiltroPainelIndicadores`. Uma única rodada de
`npx prisma migrate dev --name rollup_e_ajustes_20260920` aplica tudo de uma vez.

**Pendências decorrentes:**
- Heder rodar a migração acima.
- Depois da migração, rodar "Executar agora" pra popular `DemandaAtual`/`DemandaMensal` pela
  primeira vez (o dashboard fica vazio até isso acontecer, já que não lê mais de
  `DemandaSnapshot`).
- Confirmar `Custom.Classificacao` contra um item real (assumido pelo padrão, não confirmado).
- Confirmar visualmente: título renomeado, exclusão do cliente interno no painel Agging, botão
  Salvar Filtros, colunas novas no modal de Detalhes.
- Heder ainda não rodou `scripts/inspect-devops-states.mjs` (classificação de
  Encerrada/Cancelada no Fluxo de Demandas segue provisória).
- UI de entrada manual de histórico (REQ01.06) — ainda o único caminho real pra dado retroativo.
- Confirmar `CRON_SECRET` em produção no Vercel e limite de cron jobs do plano.



## 2026-09-20 (cont.) — Diagnóstico do "sem dados" + Administração + entrada manual de verdade (REQ01.06)

Heder reportou 3 coisas na mesma mensagem: (1) a home ficou sem nenhum dado depois da
rearquitetura anterior; (2) a tela "Indicadores manuais" criada antes não atende o que ele pediu;
(3) 4 pedidos novos — aba de Administração, coluna `tipo` em usuário com acesso restrito, mover
JOB de captura pra dentro de Administração, e uma aba de entrada manual com sub-aba por painel
mensal.

**1. Diagnóstico do "sem dados":** conferido no disco (`prisma/migrations/`) que a migração
`20260920215424_rollup_e_ajustes_20260920` **já existe e está completa** (contém `DemandaAtual`,
`DemandaMensal`, `FiltroPainelIndicadores` e as colunas novas de `DemandaSnapshot`) — ou seja,
Heder rodou `npx prisma migrate dev` localmente depois da minha última mensagem. Não deu pra
confirmar via `prisma migrate status` nem via REST direto (`device_bash` não tem rota de rede
liberada pro binário do Prisma nem pra API do Supabase — só os proxies de npm/pip), então a
confirmação ficou só pela presença do arquivo de migração no disco. **Causa mais provável do
"sem dados": `DemandaAtual`/`DemandaMensal` nasceram vazias com a migração** — só passam a ter
linha depois de rodar "Executar agora" (ou o cron das 08:00) pela primeira vez após a migração.
**Ação pra Heder confirmar: abrir Administração → JOB de captura (novo caminho, ver item 3) e
clicar "Executar agora" de novo, se ainda não fez isso depois da migração.**

**2. Coluna `AllowedUser.tipo` + seção Administração:**
- `AllowedUser` ganhou `tipo String @default("user")` (valores esperados: `"adm"` | `"user"`).
- `lib/auth-server.ts` (novo): `getUsuarioAtual()` lê a sessão (via `getRouteClient`) e cruza
  com `AllowedUser.tipo` (via service client) — usado tanto no layout quanto nas rotas de API.
  `ehAdmin()` é o atalho booleano.
- `app/api/auth/me/route.ts` (novo): expõe `{ email, tipo }` do usuário logado, só pra a UI (
  `components/AppShell.tsx`) decidir se mostra o link "Administração" na navegação.
- `app/(app)/admin/layout.tsx` (novo): guarda de servidor — quem não é `tipo = "adm"` é
  redirecionado pra `/` mesmo digitando a URL direto (defesa em profundidade; esconder o link no
  menu sozinho não bloquearia acesso direto).
- `app/(app)/admin/page.tsx` (novo): landing da seção, hoje só lista "JOB de captura", preparada
  pra crescer.
- **JOB de captura mudou de rota:** `/job` → `/admin/job` (pasta antiga removida). As rotas
  `app/api/jobs/config` (GET/PUT), `app/api/jobs/execucoes` (GET) e `app/api/jobs/captura`
  (só o POST — o GET do cron continua liberado só por `CRON_SECRET`, sem sessão) agora exigem
  `ehAdmin()` — sem isso, esconder o link no menu não impediria alguém logado de chamar a API
  direto.
- `components/AppShell.tsx`: busca `/api/auth/me` ao montar; só renderiza a seção
  "Administração" (com o link pro `/admin`) quando `tipo === "adm"`. "Indicadores manuais"
  continua visível pra todo mundo (não é um recurso de administração, é dado de produto).

**IMPORTANTE — passo manual obrigatório:** o default de `tipo` é `"user"`. Depois de rodar a
migração, **ninguém** (nem o Heder) vai ver "Administração" até alguém marcar manualmente pelo
menos uma linha como admin direto no banco (Supabase Table Editor ou SQL):
`UPDATE "AllowedUser" SET tipo = 'adm' WHERE email = 'heder.martins@nstech.com.br';`

**3. Entrada manual de verdade (REQ01.06) — reescrita do zero:** a versão anterior de
`/indicadores/editar` (que reusava `components/PainelIndicadores.jsx`, o painel manual do
produto original) foi **substituída por completo** — não era o que Heder pediu. Nova página com
3 sub-abas, uma por painel do dashboard automático (Fluxo de Demandas / Agging de Viabilidade /
Backlog de Viabilidade), cada uma com formulário (mês + campos do painel + observação) e tabela
de lançamentos já feitos (editar/excluir).

Modelo de dados — **1 tabela única** `IndicadorManual` (campo `painel` como discriminador),
diferente da decisão de `DemandaAtual`/`DemandaMensal` (que são tabelas separadas): aqui o volume
é baixo por natureza (lançamento manual, poucas dezenas de linhas por produto/painel), então
3 tabelas quase idênticas só trocando o nome da coluna numérica não se justificam. Sem
granularidade de Cliente/Squad (dado histórico anterior ao rastreio por item) — decisão
explícita, documentada no schema.

- `app/api/indicadores-manuais/route.ts` (novo): GET (lista por produto+painel), POST (cria,
  upsert por `[produto,painel,mes]`), PUT (edita por id), DELETE (por id). Aberta a qualquer
  usuário logado (não é admin-only — é dado de produto).
- `lib/demandas-agregacao.ts`: novas `mesclarFluxoComManual`/`mesclarValorComManual` — mês com
  valor manual **sobrescreve** o automático nesse mês (o valor foi digitado de propósito).
- `app/api/demandas/route.ts`: busca `IndicadorManual` e aplica a mesclagem **só quando não há
  filtro de Cliente/Squad ativo** (dado manual não tem essa granularidade — misturar daria número
  errado num recorte). Com produto = "AMBOS", soma os dois produtos (contagens) ou tira a média
  das médias (aging) — aproximação aceitável pra dado histórico grosso, documentada no código.
  Os totais de Fluxo de Demandas passaram a ser somados **depois** da mesclagem (senão um mês só
  manual ficaria fora do total); "Aging/Backlog ATUAL" continuam vindo do snapshot vivo, sem
  influência do manual (que é só histórico).

**Nova migração pendente (ainda não rodada por Heder):** `AllowedUser.tipo`, enum
`PainelIndicador`, model `IndicadorManual` — tudo já no `schema.prisma`, falta
`npx prisma migrate dev --name administracao_e_manual_20260920`.

**Órfão, não removido:** `components/PainelIndicadores.jsx` e `app/api/painel-state/route.ts`
(o painel manual do produto original) não são mais referenciados por nenhuma tela — deixados no
código porque `AlertaConfig.fonte = PAINEL_MANUAL` ainda pode apontar pra lá (não confirmado se
algum alerta configurado usa essa fonte). Seguro de remover depois, quando confirmado que nada
mais usa.

`npx tsc --noEmit` limpo depois de tudo isso.

**Pendências decorrentes (atualizadas):**
- Heder rodar a migração `administracao_e_manual_20260920`.
- Marcar manualmente `tipo = 'adm'` pro(s) e-mail(s) que devem ver Administração (nenhum e-mail
  fica admin por padrão).
- Rodar "Executar agora" (em Administração → JOB de captura) se ainda não fez depois da migração
  anterior — é a causa mais provável do "sem dados" na home.
- Confirmar `Custom.Classificacao` contra um item real (ainda assumido).
- Heder ainda não rodou `scripts/inspect-devops-states.mjs`.
- Confirmar `CRON_SECRET` em produção no Vercel e limite de cron jobs do plano.


## 2026-09-20 (cont.) — Bug: `Custom.Classificacao` não existe, JOB parava com erro 400

Heder rodou "Executar agora" (Administração → JOB de captura) e a captura falhou por completo:
`TF51535: Cannot find field Custom.Classificacao` (erro 400 na chamada `wit/workitemsbatch`).
Confirma a suspeita que eu já tinha sinalizado como não confirmada: `Custom.Classificacao` era
uma suposição minha (padrão de nomenclatura dos outros campos custom deste org), nunca validada
contra um item real — e estava errada. Como o Azure DevOps rejeita o LOTE INTEIRO quando um único
campo pedido não existe, isso derrubava a captura dos ~1700 itens de uma vez, não só o campo
"Classificação".

**Correção aplicada:** removido `"Custom.Classificacao"` de `CAMPOS_SNAPSHOT` em
`lib/devops-client.ts` (comentado, com nota do motivo). O código que lê esse campo em
`lib/job-captura.ts` já tratava ausência com `?? null`, então não precisou de mudança — a coluna
`classificacao` simplesmente fica `null` até o campo certo ser confirmado e reincluído.

**Próximo passo pra achar o nome certo:** já existe `scripts/inspect-devops-fields.mjs` (lista
todos os campos de um item real de KMM4 e KMM5) — Heder ainda não rodou. Rodar
`node --env-file=.env scripts/inspect-devops-fields.mjs` e procurar na saída um campo que pareça
"Classificação" (provavelmente ainda `Custom.*`, mas com sufixo diferente do esperado). Assim que
confirmado, reincluir em `CAMPOS_SNAPSHOT` e no comentário do schema.

Esse mesmo script serve pra confirmar em definitivo o mapeamento dos outros campos custom
(Cliente, DataAberturaProduto, Etapa) — vale rodar mesmo já "funcionando", já que a suposição do
padrão de nomenclatura acabou de se provar não confiável.


## 2026-09-20 (cont.) — Confirmado: JOB rodando e dashboard exibindo dados

Heder confirmou: depois do fix do `id` faltante em `DemandaMensal` (bug sistêmico do
`randomUUID()`, ver entrada acima), "Executar agora" rodou com sucesso e a home já mostra os
indicadores (Fluxo de Demandas, Agging de Viabilidade, Backlog de Viabilidade) — ou seja, o
"sem dados" reportado no início desta sessão de trabalho estava mesmo ligado à captura que não
tinha rodado (e depois travava) desde a rearquitetura de `DemandaAtual`/`DemandaMensal`.

**Estado atual, consolidado:**
- Migração `20260920215424_rollup_e_ajustes_20260920` aplicada.
- Migração `administracao_e_manual_20260920` (AllowedUser.tipo, PainelIndicador,
  IndicadorManual) — Heder precisa confirmar se já rodou; sem ela, a seção Administração e a
  entrada manual não funcionam.
- JOB de captura funcionando (rodando sem `Custom.Classificacao`, campo removido por não
  existir — ver entrada de erro acima).
- Dashboard automático (home) exibindo dados reais pela primeira vez.

**Pendências que continuam em aberto (não confirmadas ainda por Heder):**
- Marcar `tipo = 'adm'` pro e-mail dele em `AllowedUser` (senão não vê a seção Administração,
  mesmo com a migração aplicada).
- Rodar `node --env-file=.env scripts/inspect-devops-fields.mjs` pra achar o reference name real
  do campo "Classificação" (e revalidar de quebra Cliente/DataAberturaProduto/Etapa, já que a
  suposição de padrão de nomenclatura se provou não confiável nesse caso).
- Rodar `scripts/inspect-devops-states.mjs` (classificação Encerrada/Cancelada no Fluxo de
  Demandas segue heurística provisória).
- Confirmar `CRON_SECRET` em produção no Vercel e limite de cron jobs do plano.


## 2026-09-20 (cont.) — 5 ajustes finos pós-entrega: filtro, layout, produto no manual, regra de mesclagem e mover pra Administração

**1. Exclusão de "KMM (INTERNO)" estendida ao Backlog de Viabilidade:** antes só o painel Agging
excluía esse cliente. Renomeei a constante `CLIENTE_EXCLUIDO_AGING` → `CLIENTE_EXCLUIDO_VIABILIDADE`
(escopo maior) e apliquei em `calcularBacklogViabilidade` e no `backlogAtual`/`agingAtual` de
`app/api/demandas/route.ts`. Fluxo de Demandas continua sem excluir (nunca foi pedido lá).

**2. Layout — 3 painéis numa linha só:** `app/(app)/page.tsx` tinha o Fluxo de Demandas em card
cheio, com Agging/Backlog num grid 2 colunas abaixo. Virou um único grid de 3 colunas
(`gridTemplateColumns: "1.6fr 1fr 1fr"`), Fluxo mais largo que os outros dois, todos na mesma
linha.

**3 e 5. Indicadores manuais — produto explícito + mudou pra dentro de Administração:** a tela
tinha um seletor de Produto, mas discreto (canto direito, sem rótulo) — reposicionei como campo
"Produto" com label, no topo, mesmo padrão visual dos outros filtros do sistema. Ao mesmo tempo,
por pedido de Heder, a tela **saiu de `/indicadores/editar` (livre pra qualquer logado) e virou
`/admin/indicadores-manuais`** — card novo na landing de Administração, ao lado do JOB de
captura. A API (`app/api/indicadores-manuais/route.ts`) agora exige `ehAdmin()` nos 4 métodos —
antes era aberta a qualquer sessão válida.

**4. Regra de mesclagem do manual mudou — não respeita mais Cliente/Squad, só Data:** Heder
reportou que um lançamento manual não refletiu no painel, e pediu explicitamente que o dado
manual ignore o filtro de Cliente/Squad (esse dado nunca teve essa granularidade mesmo) e passe a
respeitar SÓ o filtro de Data. Antes, a mesclagem em `app/api/demandas/route.ts` só rodava quando
`!cliente && squads.length === 0` — ficou sempre ligada agora, e o que filtra é comparar o "mes"
manual (`YYYY-MM`) com o intervalo `dataInicio`/`dataFim` (também truncado pra `YYYY-MM`) antes de
mesclar. `lib/demandas-agregacao.ts` teve o comentário da seção de mesclagem atualizado pra
refletir essa regra nova.

`npx tsc --noEmit` limpo depois de tudo (precisou de `rm -rf .next` no meio — cache antigo
apontando pra rota `/indicadores/editar` removida, resolvido).

**Pendências que continuam as mesmas de antes** (migração `administracao_e_manual_20260920`,
marcar `tipo='adm'`, rodar `inspect-devops-fields.mjs`/`inspect-devops-states.mjs`, confirmar
`CRON_SECRET`).


## 2026-09-20 (cont.) — Slider de Data, bug crítico no acesso a /admin corrigido

**Bug: tela de Administração quebrada (erro ao abrir /admin ou /admin/job).** Causa raiz: o
guard de servidor `app/(app)/admin/layout.tsx` chama `getUsuarioAtual()`, que usa
`getRouteClient()` (`lib/supabase-server.ts`) pra ler a sessão. Essa função foi escrita
originalmente só pra Route Handlers, onde escrever cookie é permitido — mas o `@supabase/ssr`
tenta re-gravar/rotacionar o cookie de sessão internamente sempre que chama `auth.getUser()`, e
`cookieStore.set(...)` sem proteção **estoura exceção** quando chamado de dentro de um Server
Component comum (não Route Handler nem Server Action) — que é exatamente o caso do layout.
Resultado: toda vez que um usuário abria `/admin/**`, a checagem de admin quebrava a página
inteira (erro 500), admin ou não.

**Correção:** os callbacks `set`/`remove` de `getRouteClient()` agora envolvem a gravação em
try/catch (silenciam o erro em vez de propagar) — é o padrão recomendado pelo próprio Supabase
pra uso em Server Components no App Router; o middleware já garante que a sessão é renovada a
cada request, então esse set/remove aqui nunca precisou de fato funcionar fora de um Route
Handler. Não muda nada pro uso já existente em rotas de API (onde o cookie realmente é
gravável e continua sendo gravado normalmente).

**Slider de intervalo no filtro de Data:** Heder mandou print de referência (slicer "Created
Date" do Power BI: 2 caixas de data + barra com dois cursores). Não havia lib de slider no
projeto — implementado do zero (`SliderData`, componente novo em `app/(app)/page.tsx`) com dois
handles arrastáveis via mouse. Os limites do slider (`min`/`max`) vêm de `filtros.dataMin` e
`filtros.dataMax`, novos campos calculados em `app/api/demandas/route.ts` a partir do menor/maior
`createdDate` de `DemandaAtual` pro produto selecionado (ignora cliente/squad de propósito, senão
os limites do slider ficariam mudando conforme esses outros filtros). Os dois inputs de data
(de/até) foram reagrupados num card próprio "CREATED DATE" com botão de limpar (borracha) e
recolher (chevron), acima da linha de filtros de Cliente/Squad.

`npx tsc --noEmit` limpo (o `rm -rf .next` de praxe não rodou dessa vez porque o Heder tinha
`npm run dev` ativo escrevendo no cache — sem problema, não precisou limpar porque nenhuma rota
foi removida nesta rodada).


## 2026-09-20 (cont.) — Números de destaque passam a ser "só o último mês em tela"

Heder pediu, depois de eu detalhar como os números 270/105/1 do Fluxo de Demandas eram
calculados: mostrar só o valor do ÚLTIMO MÊS visível no gráfico nos números de destaque, não mais
a soma do período inteiro selecionado.

Mudança em `app/api/demandas/route.ts`: `totais.abertas/encerradas/canceladas` deixaram de ser
`reduce` (soma de todos os meses da série) e passaram a ler só o último índice de
`fluxoComManual` (a série já com o manual mesclado). `totais.agingAtual`/`backlogAtual` também
mudaram de fonte: antes vinham de um cálculo "ao vivo" separado sobre `itensAtuais`
(`DemandaAtual` filtrado, sem olhar pra série mensal) — podiam divergir do que o próprio gráfico
desenhava no último ponto. Agora leem o último valor de `agingViabilidade`/`backlogViabilidade`
(as séries mensais, já mescladas com manual), garantindo que o número de destaque sempre bate
com o ponto mais à direita da linha/coluna.

Efeito colateral positivo: o código ficou mais simples (removida a computação separada de
`backlogAtual`/`agingsAtuais`/`agingAtual` a partir de `itensAtuais`) e mais consistente (só uma
fonte de verdade por painel, a série mensal, em vez de duas fontes que podiam discordar).

`npx tsc --noEmit` limpo.


## 2026-09-20 (cont.) — Heder reportou divergência nos números de setembro, script de comparação criado

Heder mandou 2 listas exportadas do Azure DevOps (abertas em setembro = 26, encerradas = 22) que
não batem com o painel. Sem acesso de rede a produção a partir daqui (`device_bash` não alcança
Azure DevOps nem Supabase), não dá pra fazer o diff linha a linha diretamente — criei
`scripts/comparar-mes.mjs` pra isso: reproduz exatamente a mesma WIQL/campos da captura de
produção (KMM4+KMM5, `Product Backlog Item`, mesma `classificarEncerramento`) e lista os itens
"abertos"/"encerrados-cancelados" de um mês, com a data em UTC e convertida pra BRT lado a lado.
Uso: `node --env-file=.env scripts/comparar-mes.mjs 2026-09`.

**Hipóteses levantadas (nenhuma confirmada ainda — dependem do Heder rodar o script e/ou o
`inspect-devops-fields.mjs`, que também segue pendente):**

1. **Fuso horário na contagem por mês.** `chaveMes()` (`lib/demandas-agregacao.ts`) agrupa por
   mês usando UTC (`getUTCMonth`). Um item criado perto da meia-noite em horário de Brasília
   (UTC-3) pode cair no mês seguinte em UTC — o script novo mostra as duas contagens lado a lado
   pra confirmar se é isso.
2. **Campo de "Data" de fechamento pode não ser `Microsoft.VSTS.Common.ClosedDate`.** A lista de
   "encerradas" que Heder mandou tem colunas que a captura atual nem busca (Classificação,
   Entrega, Data Produto, Data proposta Aceita) — a coluna "Data" que ele usa como referência de
   fechamento pode ser um campo custom diferente do que assumimos (mapeamento de
   `Microsoft.VSTS.Common.ClosedDate` pra "Closed Date" nunca foi confirmado — mesma situação que
   já pegou `Custom.Classificacao` antes). Reforça a necessidade de rodar
   `scripts/inspect-devops-fields.mjs`.
3. **Escopo de Area Path.** A captura só olha os 7 Area Paths configurados por produto em
   `lib/devops-projetos.ts` — se a exportação do Heder não tiver esse mesmo filtro (por exemplo,
   vier de uma área/board fora dessa lista), item apareceria na lista dele e não no painel.

Nenhuma dessas foi confirmada — só são as explicações mais prováveis dado o que já sabemos do
código. Próximo passo real depende do Heder rodar o script novo (e, se possível, o de campos)
e mandar a saída.

## 2026-09-20 (cont.) — Divergência de setembro: causa raiz confirmada (Area Path "Arquitetura" fora do escopo) + RN02.10 documentada

Heder rodou `scripts/comparar-mes.mjs 2026-09` e colou a saída completa: **110 abertas** (KMM4+KMM5)
e **86 encerradas / 0 canceladas**, com contagem UTC e BRT idênticas (110=110) — **hipótese 1
(fuso horário) descartada**, não há item mudando de mês por causa de UTC vs BRT-3.

Heder também confirmou explicitamente que o campo de fechamento usado na exportação dele É o
Closed Date (`Microsoft.VSTS.Common.ClosedDate`) — **hipótese 2 (campo errado) descartada**.

Comparando o print original do Heder (24 linhas visíveis, ele afirmou 26 no total, só KMM4) com a
saída do script (19 itens KMM4 no mês), sobraram 6 itens no print dele sem correspondência no
script: "Ajustes Mapas", "Criar lista de requisições Shopee", "Versionamento Meli Letsara",
"Versionar backend gzip" (os 4 sem Cliente preenchido), "Cancelar MDFe no Pcargas" (CONFIANCA) e
"Melhoria no aplicativo do checklist [ERS-PLATINUM]" (ERS, State=Cancelado).

Heder esclareceu duas coisas na resposta:

1. **Sobre o item ERS (cancelado):** mesmo cancelada, uma demanda deve continuar contando em
   "abertas" no mês em que foi criada — pediu pra isso virar regra explícita do indicador.
   Verificação no código (`calcularFluxoDemandas`, `lib/demandas-agregacao.ts`): a contagem de
   "abertas" **já não tem nenhum filtro por `state`** — todo item com `createdDate` no mês conta,
   cancelado ou não. Ou seja, **não havia bug**, o comportamento pedido já era o comportamento
   real. Mesmo assim, documentei isso como **RN02.10** com um comentário explícito no código,
   bem em cima do bloco que conta "abertas", pra deixar claro que a ausência de filtro de state
   ali é intencional e não deve ser "corrigida" no futuro por engano.

2. **Sobre os demais itens do print:** são de uma squad/Area Path chamada **"Arquitetura"**, que
   o filtro de captura **não cobre de propósito** (não é um dos 7 Area Paths configurados pra
   KMM4 em `lib/devops-projetos.ts`: Rangers, BeeSharp, Debitos Tecnicos, Melhorias, DreamTeam,
   Roadmap, EDI e Fast Track). Ou seja, **hipótese 3 (escopo de Area Path) confirmada como causa
   raiz** — não é bug, é escopo intencional. Heder confirmou o número correto de abertura de
   setembro é **22**.

**Reconciliação (aritmética minha, ainda não 100% fechada com Heder):** 26 (total do print) − 4
itens sem Cliente (os mais prováveis de serem "Arquitetura", por serem tarefas técnicas/infra sem
cliente associado) = 22, batendo exatamente com o número confirmado por Heder. Isso deixaria os
outros 2 itens flagados — "Cancelar MDFe no Pcargas" (CONFIANCA) e "Melhoria no aplicativo do
checklist [ERS-PLATINUM]" (ERS) — como possivelmente FORA da squad Arquitetura (já que têm
cliente real associado), o que deixaria uma lacuna de 3 entre o que o script captura (19) e o
alvo confirmado (22) mesmo somando esses 2 (19+2=21, ainda falta 1). Perguntei a Heder se esses 2
itens também são da squad Arquitetura ou se representam uma lacuna real de captura ainda não
explicada — resposta pendente.

**Nenhuma mudança de escopo foi feita** em `lib/devops-projetos.ts` — a exclusão da Arquitetura é
intencional segundo o próprio Heder, não deve ser adicionada à lista de Area Paths capturados.

`npx tsc --noEmit` limpo após o comentário de RN02.10 em `lib/demandas-agregacao.ts`.

## 2026-09-20 (cont.) — Contagem de abertas ainda abaixo do esperado (19 vs 22); filtro "Sem cliente" adicionado; script de diagnóstico item a item criado

Heder reportou que o painel ainda mostra 19 abertas em setembro, deveria ser 22, e apontou 3 itens
específicos que deveriam contar e (segundo ele) não estão: "Melhoria no aplicativo do checklist
[ERS-PLATINUM]" (cancelada) e dois itens "[Contra CT-e] - ..." sem Cliente preenchido.

**Verificação de código (não achei filtro que explique a exclusão):**
- `calcularFluxoDemandas` (RN02.10, já documentada) não filtra por `state` — cancelada já conta.
- A captura (`fetchPbisParaSnapshot`, `executarCaptura`) não filtra por `state` nem por `cliente`
  vazio — grava qualquer PBI dentro dos Area Paths configurados, cliente nulo incluso (coluna é
  `String?`, sem constraint).
- `/api/demandas` só filtra por Cliente/Squad quando o usuário efetivamente seleciona algo no
  dropdown — sem filtro nenhum (`cliente=""`, `squads=[]`), todo item do produto deveria contar.

Ou seja, o código não tem um filtro óbvio de state/cliente causando a exclusão — as duas hipóteses
que o Heder levantou (cancelada não conta, sem-cliente não conta) **não bateram** com o que o
código realmente faz. Isso deixa duas explicações mais prováveis, que só dá pra confirmar com
acesso direto a produção (que não tenho daqui): (a) esses itens específicos simplesmente ainda não
foram capturados pro Supabase (ex.: criados/alterados depois da última execução bem-sucedida do
JOB — o CRON_SECRET em produção ainda não foi confirmado, ver pendências), ou (b) algum filtro de
Cliente/Squad salvo (`Salvar Filtros`) está ativo na tela do Heder reduzindo o total sem ele notar.

**O que foi feito nesta rodada:**
1. Implementado o pedido concreto de normalizar cliente vazio: novo `SEM_CLIENTE = "Sem cliente"`
   em `lib/demandas-agregacao.ts`. O dropdown de Cliente (`filtros.clientes` em
   `app/api/demandas/route.ts`) agora inclui a opção "Sem cliente" quando existe pelo menos 1 item
   sem `Custom.Cliente` preenchido; selecioná-la filtra por `cliente IS NULL` em vez de igualdade
   de string. Aplicado nos 3 pontos que filtram por cliente: `/api/demandas` (queryAtual e
   queryMensal) e `/api/demandas/aging-detalhe`. Importante: isso é só o FILTRO — sem filtro de
   cliente selecionado, itens sem cliente já contavam normalmente nos totais antes desta mudança
   também (não era isso que causava o 19 vs 22).
2. Criado `scripts/checar-captura.mjs`: dado um termo de busca (trecho do título), busca o item na
   Azure DevOps (sem filtro de Area Path/State, pra não esconder nada) e cruza com o que está
   gravado em DemandaAtual no Supabase — mostra se o item está DENTRO/FORA do escopo de Area Path
   configurado, se já foi capturado, e se os dados gravados batem com a Azure DevOps agora. Uso:
   `node --env-file=.env scripts/checar-captura.mjs "Contra CT-e" "checklist"`. Pedido ao Heder
   rodar esse script pra decidir entre as hipóteses (a)/(b) acima antes de qualquer mudança de
   código nova — sem isso, qualquer fix seria um chute.

`npx tsc --noEmit` limpo.

## 2026-09-20 (cont.) — Diagnóstico com `checar-captura.mjs`: 2 dos 3 itens já capturados (dado estava desatualizado), ERS-PLATINUM continua fora por Area Path

Heder rodou `scripts/checar-captura.mjs "Contra CT-e" "checklist"`. Resultado:

- **Os 2 itens "[Contra CT-e]" (#43030, #43032):** JÁ ESTÃO em `DemandaAtual`, com os dados
  corretos (Backlog, sem cliente, squad DreamTeam — dentro do escopo configurado), `atualizadoEm`
  bem recente (2026-09-20T22:45). Ou seja, **não são um bug de filtro nem de regra** — o dado
  simplesmente estava desatualizado quando ele checou o painel antes (provavelmente porque esses
  itens foram criados em 14/09 e a captura só pegou eles numa execução mais recente do JOB). Uma
  vez capturados, `calcularFluxoDemandas` já conta os dois normalmente (sem filtro de cliente).
  **Ação: nenhuma mudança de código necessária aqui — só confirmar que o painel reflete o dado
  atual (pode exigir um refresh da tela / nova consulta à API).**

- **"Melhoria no aplicativo do checklist [ERS-PLATINUM]" (#41329):** CONTINUA fora do Supabase.
  Causa raiz confirmada: `System.AreaPath` desse item na Azure DevOps é **`KMM4`** (a raiz do
  projeto, sem nenhum time/squad atribuído) — não é subpath de nenhum dos 7 Area Paths
  configurados em `lib/devops-projetos.ts` (Rangers, BeeSharp, Debitos Tecnicos, Melhorias,
  DreamTeam, Roadmap, EDI e Fast Track). A `clausulaAreaPaths()` usa `UNDER`, que não pega um item
  sentado exatamente na raiz do projeto sem team atribuído. **Isso é diferente do que a explicação
  anterior de "squad Arquitetura" sugeria** — não é uma squad nomeada fora do escopo, é um item
  sem squad nenhuma atribuída. Como Heder pediu explicitamente que esse item conte em "abertas",
  fica uma decisão em aberto pra ele: (a) ampliar o escopo da captura pra também pegar itens sem
  team atribuído (`AreaPath = 'KMM4'` exato, além dos UNDER), o que pode trazer outros itens
  "órfãos" além deste; ou (b) corrigir o item na Azure DevOps atribuindo um team/Area Path válido
  a ele, o que já resolveria sem mudança de código. Pergunta feita ao Heder, nenhuma mudança de
  escopo foi feita ainda.

Achados incidentais (não fazem parte da investigação de setembro, vieram junto na busca por
"checklist"): #7511 (jan/2026, AreaPath fora do escopo) e #6840/#16349 (cancelados,
cliente=KMM (INTERNO), dentro do escopo, já capturados corretamente) — sem ação necessária.

## 2026-09-20 (cont.) — Captura ampliada pra itens sem Area Path, botão "Demandas Abertas" com detalhe, logo oficial

Heder vai corrigir o item ERS-PLATINUM (#41329) direto na Azure DevOps, mas pediu 3 coisas em
paralelo:

1. **Captura de itens sem team/Area Path atribuído.** Novo `clausulaAreaPathsComRaiz(project,
   areaPaths)` em `lib/devops-client.ts` — mesma cláusula UNDER de sempre, mais
   `[System.AreaPath] = '<project>'` (a raiz exata do projeto, sem subpath). Usada só em
   `fetchPbisParaSnapshot` (a captura que alimenta os indicadores) — `getBacklogAtivo` e
   `getRoadmapItems` continuam restritos aos times configurados, ninguém pediu mudar esses.
   Um item pego por essa cláusula extra grava `squad = "KMM4"` (ou "KMM5") em
   DemandaAtual/DemandaMensal — como o dropdown de Squad já lista os valores distintos
   capturados, isso já cria a opção "KMM4" no filtro automaticamente, sem precisar de nenhum
   sentinela/tratamento especial (diferente do que foi feito pra "Sem cliente").

2. **Botão "Demandas Abertas" + modal de detalhe no painel Fluxo de Demandas.** Botão no canto
   inferior direito do card (`app/(app)/page.tsx`), abre modal com a lista de itens que compõem o
   número "ABERTAS" exibido (mesmo mês que o KPI mostra — o último da série
   `fluxoDemandas.meses`). Nova rota `app/api/demandas/abertas-detalhe/route.ts`: aplica os
   mesmos filtros de Produto/Cliente/Squad/Data da tela + filtro de mês (`mes`, obrigatório) via
   `chaveMes(createdDate)`, sem filtro de State (RN02.10 — cancelada no mês continua contando).
   A tabela mostra o State de cada item e marca "CANCELADA" quando `classificarEncerramento`
   classifica como tal, pra deixar visível por que um item cancelado está na lista.
   Reaproveita o padrão de modal já usado no "Detalhes" de Agging de Viabilidade (mesmo estilo,
   mesma estrutura de overlay/tabela).

3. **Logo oficial.** Substituído o "kmm" em texto (Sora, cor laranja, simulando o wordmark) no
   header do Sidebar (`components/AppShell.tsx`) pela arte real enviada por Heder — salva em
   `public/logo-kmm.png`. Ícone `PanelLeft` (que ficava do lado do texto) removido, já que a
   logo real substitui os dois.

`npx tsc --noEmit` limpo depois de todas as mudanças.

## 2026-09-20 (cont.) — "Cancelar MDFe no Pcargas" é o mesmo caso do ERS: item órfão de squad, já coberto pela captura ampliada

Heder checou "Cancelar MDFe no Pcargas" (#43862) com `checar-captura.mjs`: State = "Backlog"
(bateria a regra dos painéis de Viabilidade), Cliente = CONFIANCA (não é o cliente excluído), mas
`AreaPath = "KMM4"` — exatamente a raiz do projeto, sem squad atribuída. Mesmo padrão do
ERS-PLATINUM (#41329) investigado antes: não é bug de regra (State/Cliente corretos), é item
"órfão" que o UNDER dos 7 times configurados nunca pegava.

**Boa notícia: já está coberto.** A mudança feita mais cedo hoje em `lib/devops-client.ts`
(`clausulaAreaPathsComRaiz`, que adiciona `[System.AreaPath] = '<project>'` à captura) resolve
esse caso genericamente — não é uma correção item a item, pega qualquer PBI sentado na raiz do
projeto sem squad, incluindo este. Não precisou de nenhuma mudança de código nova. Só falta uma
execução do JOB de captura pra esse item entrar em DemandaAtual/DemandaMensal e passar a contar
em Backlog/Agging de Viabilidade (state=Backlog, cliente≠KMM (INTERNO), então entra nos dois).

## 2026-09-20 (cont.) — Lote de 9 ajustes de UI no painel de indicadores

Heder pediu 9 ajustes de uma vez no painel de indicadores (`app/(app)/page.tsx`):

1-3. **Modal "Demandas Abertas": largura total, filtro por coluna, ordenado por Criado em.**
Criado um componente genérico `ModalDetalheDemandas` (substitui o modal de abertas que era
hard-coded) — largura `100%` do overlay (que já tem padding:20, então ocupa quase a tela toda),
uma linha de `<input>` de filtro por coluna abaixo do cabeçalho (substring case-insensitive sobre
o texto de cada coluna), e ordenação fixa por uma coluna default (`ordenarPadrao`), decrescente
(mais recente primeiro) — pra abertas, por "Criado em".

4. **Botão "Demandas Encerradas"**, mesmo layout/detalhamento do "Demandas Abertas" — usa o mesmo
`ModalDetalheDemandas`, com `ordenarPadrao="encerradoEm"`. Nova rota
`app/api/demandas/encerradas-detalhe/route.ts`: mesmos filtros de Produto/Cliente/Squad/Data (Data
continua filtrando por Created Date, igual ao resto da tela), filtra por mês de Closed Date +
`classificarEncerramento(state) === "encerrada"` (não inclui canceladas — essas já têm o número
"NEGADAS/CANC." separado). `ItemDetalheAbertas` renomeado pra `ItemFluxoDetalhe` (tipo
compartilhado pelos dois modais, mesmo formato de resposta).

5. **Altura fixa dos 3 painéis** (`ALTURA_PAINEL = 490`): cada card virou flex column com o
gráfico em `flex:1, minHeight:0` (era `height:260`/`height:200` fixo) — a altura extra de cada
card (linha de botão, comentário) é absorvida encolhendo só a área do gráfico, os 3 cards ficam
com a mesma altura total.

6-7. **Comentário "Obs.: Não está sendo considerado demandas internas KMM."** replicado em Agging
de Viabilidade e Backlog de Viabilidade, logo abaixo da descrição do painel — reforça em texto a
regra que já existe em código (`CLIENTE_EXCLUIDO_VIABILIDADE`).

8. **Botão "Detalhes" do Agging de Viabilidade** movido do topo (ao lado do título) pra base do
painel, mesmo padrão visual do botão "Demandas Abertas"/"Demandas Encerradas" no Fluxo.

9. **Barra de filtros (Cliente/Squad) ao lado da barra de Data**, alinhadas horizontalmente — as
duas ficavam empilhadas verticalmente antes; agora estão dentro de um `<div style={{display:flex}}>`
comum.

`npx tsc --noEmit` limpo depois de todas as mudanças.

## 2026-09-21 — Primeiro commit feito; push bloqueado por falta de credencial GitHub neste ambiente

Pedido de Heder: fazer o primeiro commit + push rumo à produção. Antes disso, corrigido um
problema real que ia quebrar o deploy na Vercel: faltava `"postinstall": "prisma generate"` em
`package.json` — sem isso, a Vercel instala dependências mas nunca gera o Prisma Client, e toda
chamada que usa o banco quebraria em runtime. Adicionado.

Removido também um `.git/index.lock` travado que impedia qualquer `git add`/`commit` (pedida e
concedida permissão de exclusão nesta pasta pro Heder, só pra esse arquivo).

Feito: `git config user.name/email` (só neste repo, não global) + `git add .` (conferido que
`.env`, `node_modules` e `.next` não entraram no stage) + commit inicial (70 arquivos, commit
`f88042e`).

**Push bloqueado:** `git push -u origin main` falhou com "could not read Username for
'https://github.com'" — este ambiente (a VM Linux isolada que o `device_bash` usa, montando só as
pastas conectadas) não tem nenhuma credencial de Git/GitHub configurada (nem `.gitconfig` global,
nem credential helper, nem `gh` CLI instalado) — as credenciais reais do Heder (GitHub
Desktop/VS Code/terminal do Windows) não são acessíveis a partir daqui. O commit já está pronto
localmente em `C:\Projetos\produto-hub`; falta só o Heder rodar `git push -u origin main` (ou usar
o GitHub Desktop) a partir do terminal/app real dele, onde a autenticação já existe.

## 2026-09-21 (cont.) — Push concluído (pelo Heder) e projeto criado na Vercel

`git log` mostra o repositório sincronizado com `origin/main` (commit `beb99a2` além do inicial
`f88042e`) — o push que eu não conseguia fazer daqui (sem credencial de GitHub neste ambiente)
foi concluído pelo próprio Heder, a partir do git dele. Projeto já importado na Vercel.

Próximo passo: configurar as variáveis de ambiente no painel da Vercel (Settings → Environment
Variables) e redeploy — nenhuma mudança de código necessária aqui, só configuração no dashboard.

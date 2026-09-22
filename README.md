# Produto Hub — KMM4/KMM5

Aplicação web para consolidar indicadores, alertas e controles do time de Produto
(KMM4 e KMM5): backlog/aging, exportação de OPR em PDF e alertas por e-mail.
API-first e agentizada (exposta também via MCP para consumo por agentes).

## Decisões de arquitetura (registradas em 2026-09-15)

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Repositório | **Novo, do zero** | Não reaproveitar o `roadmap-panel` — código mais simples e sem dívida técnica herdada |
| Framework | **Next.js 14 (App Router) + TypeScript** | Frontend e backend (API routes) no mesmo repo, deploy nativo no Vercel |
| Hospedagem | **Vercel** | Custo bem menor que AWS ECS para uma ferramenta interna; deploy automático a cada push |
| Banco + Auth | **Supabase (Postgres + Auth)** | Free tier generoso; Auth já suporta e-mail/senha hoje e provider Azure AD nativamente no futuro, sem trocar de fornecedor |
| Autenticação (fase 1) | **Allowlist de e-mail** (tabela `allowed_users` no Postgres, checada no middleware) | Simples de operar agora; caminho de migração direto para SSO depois |
| Autenticação (fase 2 — futura) | **Azure AD / Entra ID via Supabase Auth (provider Azure)** | Quando o time de TI liberar o app registration |
| Geração de PDF (OPR) | **@react-pdf/renderer** | Renderiza em serverless sem dependências de sistema (ao contrário de weasyprint/Puppeteer) |
| E-mail de alertas | **Resend** | Barato, boa entrega, fácil de trocar depois por Microsoft Graph se migrar para M365 |
| Origem de dados | **Azure DevOps REST API** (PAT) | Work items/boards do time |
| Agentização | **Servidor MCP em `/api/mcp`** usando `@modelcontextprotocol/sdk`, chamando os mesmos serviços da API REST | Evita duplicar lógica; qualquer agente Claude consome os mesmos dados |

## Estrutura

```
app/
  login/page.tsx                    # tela pública de login (magic link)
  auth/callback/route.ts            # callback do magic link
  (app)/                            # route group autenticado, envolvido pelo AppShell
    layout.tsx
    page.tsx                        # Gestão de indicadores (resumo: KPIs + tabela por categoria)
    indicadores/editar/page.tsx     # editor completo (componente PainelIndicadores portado)
    clientes/page.tsx               # Gestão de clientes (CRUD manual + import Excel)
    roadmap/page.tsx                # Roadmap e entregas (Epics/Features do Azure DevOps por trimestre)
    alertas/page.tsx                # Alertas e avisos (feed unificado por severidade)
  api/
    painel-state/route.ts           # GET/PUT do estado compartilhado do painel (PainelEstado)
    devops/workitems/route.ts       # proxy WIQL para o Azure DevOps
    indicadores/route.ts            # agregado automático de aging/backlog via DevOps
    roadmap/route.ts                # Epics/Features do DevOps agrupados por trimestre
    clientes/route.ts               # CRUD da carteira de clientes
    clientes/[id]/route.ts          # editar/excluir um cliente
    clientes/import/route.ts        # importação em lote via planilha Excel
    opr/route.ts                    # geração de OPR em PDF server-side (placeholder de layout)
    alerts/check/route.ts           # motor de alertas — lê PAINEL_MANUAL e/ou DEVOPS_AUTO conforme a regra
    avisos/route.ts                 # feed unificado (alertas disparados + informativos de roadmap)
    auth/request-link/route.ts      # solicitação do magic link (checa allowlist)
    mcp/route.ts                    # servidor MCP (tools: get_indicadores, listar_alertas_disparados)
components/
  AppShell.tsx                      # sidebar + header + seletor de produto (KMM4/KMM5/Ambos)
  ProdutoContext.tsx                # contexto React do produto selecionado globalmente
  PainelIndicadores.jsx             # painel real portado do artifact do Heder (client component)
lib/
  devops-client.ts, supabase.ts, supabase-server.ts, auth-allowlist.ts, email.ts, kmm-theme.ts
middleware.ts                       # exige sessão Supabase (allowlist checada nas API routes)
prisma/schema.prisma                # PainelEstado, IndicadorSnapshot, AlertaConfig, AlertaDisparado, AllowedUser, Cliente
```

## Setup local

1. `npm install`
2. Copiar `.env.example` para `.env.local` e preencher:
   - `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT` (escopo **Work Items → Read**)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`, `ALERTS_FROM_EMAIL`
   - `DATABASE_URL` (connection string do Postgres do Supabase, para o Prisma)
3. `npx prisma migrate dev` — cria as tabelas (`indicador_snapshot`, `alerta`, `allowed_users`)
4. `npm run dev`

## Deploy

- Conectar o repositório GitHub ao Vercel (import automático via dashboard)
- Configurar as mesmas variáveis de ambiente no Vercel (Production + Preview)
- Vercel Cron (`vercel.json`) chama `/api/alerts/check` no intervalo definido

## Painel de indicadores (portado do artifact original)

`components/PainelIndicadores.jsx` é o componente real (KMM4/KMM5, aging por faixa, fluxo de
demandas, backlog em esteira, snapshots, entrada manual, exportação CSV e geração de OPR em PDF
no navegador via html2canvas+jsPDF), portado do artifact `painel-indicadores-kmm.jsx`.

A única mudança estrutural: a persistência trocou do storage do Artifact (isolado por navegador/
usuário) para `/api/painel-state` (GET/PUT), que grava em uma linha única da tabela `PainelEstado`
no Postgres — ou seja, o time inteiro agora edita e enxerga o **mesmo** dado, que era exatamente
o problema que este projeto se propôs a resolver. Todo o resto do componente (UI, gráficos, lógica
de aging, CSV, geração de OPR) foi mantido como estava.

**Decisão de arquitetura do motor de alertas (resolvida em 2026-09-15):** `AlertaConfig` agora tem
um campo `fonte` (`PAINEL_MANUAL` ou `DEVOPS_AUTO`), com regras independentes por fonte:
- `DEVOPS_AUTO`: `condicao.metrica` aponta para o payload de `/api/indicadores` (ex.: `"backlogAtivo"`, `"aging.media"`)
- `PAINEL_MANUAL`: `condicao.metrica` aponta para dentro de `data.<produto>` do `PainelEstado` (ex.: `"aging"`, `"backlog.execucao"`, `"incidentes"`)

`/api/alerts/check` só busca a fonte que alguma regra ativa realmente usa, para não fazer chamadas desnecessárias.

## Pendências / acessos necessários do Heder

- [ ] PAT do Azure DevOps com escopo Work Items → Read
- [ ] Projeto Supabase criado (URL + chaves)
- [ ] Conta Resend (ou domínio verificado para envio de e-mail)
- [ ] Nome/organização do repositório GitHub de destino
- [ ] Lista inicial de e-mails para a allowlist de acesso
- [x] Decidir a fonte de dados do motor de alertas — resolvido: os dois, com regras separadas por `fonte`
- [x] Código do artifact `painel-indicadores-kmm.jsx` — recebido e portado

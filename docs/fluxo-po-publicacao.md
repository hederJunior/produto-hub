# Fluxo do PO — Checklist de publicação (T22)

Estado conferido em **2026-11-20**. Itens marcados com ✅ já foram verificados (rodando `scripts/verificar-publicacao-fluxo-po.mjs` e o build de produção); os com ☐ dependem de uma ação sua (variáveis na Vercel, cadastro de acessos, push e deploy).

## 1. Já verificado

- ✅ **Build de produção** (`npx next build`): compila, passa no lint e na checagem de tipos; as rotas do Fluxo do PO entram como dinâmicas (não são pré-renderizadas).
- ✅ **Testes:** 101 unitários e 113 verificações de integração contra o Azure e o Supabase reais, todos passando (`npm run test:fluxo-po` e `npm run test:fluxo-po:integracao`).
- ✅ **Migration** `20261120120000_fluxo_po` aplicada no Supabase que o `.env` usa (projeto `dcojvfhoskaxqhoxgadh`): tabelas `FluxoPoChecklist` e `FluxoPoMovimento` existem.
- ✅ **RLS ligado** nas duas tabelas: a chave pública (anon) não lê nem grava (conferido com uma linha de teste, apagada em seguida).
- ✅ **Azure DevOps:** o PAT do `.env` lê o projeto KMM5 (17 esteiras), os 15 campos que o fluxo usa existem no PBI e o tipo `Assesment` existe. A **escrita** do PAT foi confirmada na T02 (e em todos os testes de integração).
- ✅ Nada temporário ficou no código (login de teste, scripts `_tmp-*`).

## 2. O que falta fazer (você)

### ☐ 2.1 Confirmar que a Vercel usa o MESMO Supabase e o MESMO PAT

Na Vercel: **Settings → Environment Variables → Production**. Precisam existir e apontar para os mesmos valores do `.env`:

| Variável | Para que serve | Observação |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | banco | tem que ser o projeto `dcojvfhoskaxqhoxgadh` (onde a migration foi aplicada) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | login (chave pública) | |
| `SUPABASE_SERVICE_ROLE_KEY` | o servidor grava o log e o checklist | **segredo**; só no servidor |
| `AZURE_DEVOPS_ORG` | `kmmbynstech` | |
| `AZURE_DEVOPS_PAT` | leitura **e escrita** no Azure | permissão **Work Items: Read & write**; guarde a data de validade (quando o PAT expira, o fluxo para de gravar — ajuste 13 de `docs/fluxo-po-ajustes.md`) |

Se a Vercel apontar para outro projeto Supabase, aplique a migration (`prisma/migrations/20261120120000_fluxo_po/migration.sql`) **nele** antes do deploy.

### ☐ 2.2 Cadastrar papel e nome de quem vai operar

Retrato atual do cadastro de acesso (17 usuários): **só 2 podem movimentar** (as duas administradoras) e **16 estão sem nome**. Sem papel a pessoa só visualiza; sem nome o "Meus itens" fica vazio e o comentário sai assinado com o e-mail.

Decisão sua: quem são PM e PO no piloto? (A planilha de decisões tem "Vamos considerar todos como PO nesse momento" e, depois, "PM, PO, GPM, Product Ops e tipo adm movimentam; os demais visualizam" — a segunda é o que o sistema faz.) Para cada pessoa, rode (um e-mail por vez; o nome deve se parecer com o do Azure DevOps):

```bash
node --env-file=.env scripts/adicionar-acesso.mjs pessoa@nstech.com.br --nome="Nome Sobrenome" --papel=PO
```

Papéis que movimentam: `PM`, `PO`, `GPM`, `Product Ops`. Ajuste também quem já é administrador e está sem nome ou com nome de uma palavra só (por exemplo, `--nome="Heder Luiz Martins Junior"`): nomes de uma palavra só não casam no "Meus itens".

### ☐ 2.3 Enviar o código e publicar

As alterações do Fluxo do PO (T10 a T22) estão **commitadas localmente e ainda não foram enviadas**. O push é seu:

```bash
git push
```

A Vercel faz o deploy a partir do `main`. Acompanhe o build em **Deployments**; se falhar, o log mostra o motivo (o build local passou).

### ☐ 2.4 Conferir depois do deploy (com login real, 5 minutos)

Use o PBI de teste **46766**, em 1.2. Pelo seu usuário, no endereço de produção:

1. O item **Fluxo do PO** aparece no menu e o quadro carrega (cerca de 170 cards).
2. O selo mostra "Você pode movimentar" para você e "Somente visualização" para um usuário sem papel.
3. **Detalhes** do 46766 abre; marque um item do checklist (aparece o seu nome e a hora) e desmarque.
4. Publique um comentário de teste (e apague-o no Azure depois).
5. Preencha a Data Comitê do 46766 e **mova 1.2 → 2.1**; veja o comentário de transição no PBI e a Data Comitê no Assesment 46767; **volte** para a 1.2.
6. Devolva o PBI ao estado original (Data Comitê vazia, Etapa Backlog) e, se quiser, apague as linhas do log desse teste.

Se algum passo falhar, os logs da Vercel (**Logs**, filtrando por `[fluxo-po]`) mostram o erro de servidor.

## 3. Reverter, se for preciso

- **Código:** na Vercel, **Deployments → versão anterior → Promote to Production** (ou desfaça os commits e faça o push).
- **Banco:** a migration só **acrescenta** duas tabelas novas; não precisa ser desfeita e não afeta o resto da plataforma.
- **Acesso:** para tirar a permissão de alguém, mude o papel dele no cadastro (`--papel=`).

## 4. Depois da publicação

Siga o `docs/fluxo-po-piloto.md`. Acompanhe os bloqueios e conflitos pelo log (`FluxoPoMovimento`) e os erros pelos logs da Vercel.

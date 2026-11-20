# Prompt de continuidade — Fluxo do PO (colar na sessão que coda o Produto Hub)

Cole o bloco abaixo como primeira mensagem da sessão de código. Antes, confirme que o arquivo `docs/fluxo-po-decisoes.md` está no repositório (ele foi gravado em `produto-hub/docs/`).

---

```text
Vamos implementar o novo menu "Fluxo do PO" no Produto Hub (Next.js 14 App Router, Supabase, Prisma, Azure DevOps REST api 7.1). A Fase 1 é só a tela de Upstream, com leitura e escrita nos PBIs do Azure DevOps.

LEIA ANTES DE QUALQUER CÓDIGO, nesta ordem:
1. docs/fluxo-po-decisoes.md  → decisões fechadas, regras de cada etapa, o que grava no Azure, escopo e premissas. É a fonte da verdade.
2. docs/decisoes-e-conhecimento.md → histórico de decisões e armadilhas do projeto (leia as entradas sobre Azure DevOps, Kanban do Upstream, Backlog, Priorização GUT e acesso).
3. lib/devops-client.ts, lib/kanban-upstream.ts, lib/backlog.ts, lib/kmm-theme.ts, lib/kmm-lista.ts, lib/datas.ts
4. components/KanbanUpstream.tsx, components/PriorizacaoGut.tsx, components/MultiSelectFiltro.tsx, components/AbasVisao.tsx, components/PageHeader.tsx
5. app/(app)/roadmap/page.tsx (como o Upstream atual é montado) e lib/auth-server.ts (ehAdmin, getUsuarioAtual)

REFERÊNCIAS (links privados do Heder; se não abrirem, ele compartilha):
- Protótipos das telas (7 artboards: esteira, 3 detalhes 1.1/1.2/2.1, radar, downstream, mapa): https://claude.ai/artifact/XDTxSVguaM7QcESeRmtNkY
- Planilha de tarefas T01 a T22, com dependências e critérios de aceite: https://claude.ai/artifact/3N2rPnKycKNYsWpYgHWu1M
- Fluxo de Upstream no Confluence (espaço NKL): "Serviços da Carteira + Times Dedicados", "Obrigações Legais e itens regulatórios", "Ecossistema TNS".

RESUMO DO QUE JÁ ESTÁ DECIDIDO (detalhes no doc):
- Etapas: 1.1 Classificação, 1.2 Priorizar e propor solução, 2.1 Comitê / Proposta de solução. 3.1, 3.2 e 4.1 só aparecem no quadro (sem regras de movimento na Fase 1). A Triagem NÃO existe no painel.
- A coluna do card é derivada dos campos do PBI (Status, Etapa, Area Path, tags). Mover grava os campos; mudar no Azure reposiciona o card.
- 1.1 → 1.2: Area Path diferente de KMM5, e Classificação, Cliente e Data Abertura Produto preenchidos.
- 1.2 → 2.1: Data Comitê preenchida; Etapa Backlog → Comitê; Status continua Backlog. A Data Comitê é copiada para o campo Data Comitê de TODOS os work items do tipo Assesment filhos do PBI (sem filho: avisa e segue).
- 2.1 → 3.1 ou 3.2: Data Comitê preenchida e Status Backlog. 3.1 = Etapa Análise + tag "Pronto para refinamento tech". 3.2 = Etapa Análise sem a tag.
- PM e PO movem em 1.1, 1.2 e 2.1 e também podem VOLTAR uma etapa (o que cada volta altera está como proposta no doc, seção 4; confirmar com o Heder antes de implementar a volta).
- Checklist de cada etapa guardado na plataforma. Comentário no PBI quando o card muda de etapa (origem, destino, usuário, data). Log de movimentos na plataforma.
- Só KMM5.
- Aging = hoje menos Data Abertura Produto (se vazia, Created Date), vermelho acima de 30 dias.

COMO TRABALHAR:
- Trabalhe por tarefa da planilha (T01 a T22), na ordem das dependências. Eu vou dizer quais IDs fazer em cada sessão. Se tiver conector para a planilha, atualize o Status; senão, me diga o que concluiu.
- Reaproveite o padrão visual da plataforma (lib/kmm-theme.ts: C, PASTEL, .kmm-btn, .kmm-card, .kmm-chip, .kmm-input, .kmm-seg) e as telas existentes. Cores: laranja NS Tech #FC4C02, fundo #F9F7F4, fontes Sora (títulos) e Inter.
- Regras do fluxo em um módulo PURO e testável (ex.: lib/fluxo-po.ts): colunas, requisitos de cada movimento e o que grava. Valide no SERVIDOR antes de qualquer escrita. A tela só reflete o resultado.
- Escrita no Azure: JSON Patch com a revisão lida (falha se o PBI mudou), mensagens de erro claras, nada gravado se uma regra falhar. Comentário de transição pela API de comentários.
- Azure: nunca coloque um reference name que talvez não exista na lista de campos do workitemsbatch (TF51535 derruba o lote). Confira que a Area Path existe antes de usar UNDER na WIQL (TF51011). Comentários: /_apis/wit/workItems/{id}/comments (api 7.1-preview.4).
- Migrations: escreva o SQL à mão em prisma/migrations/<timestamp>_<nome>/migration.sql; eu rodo no Supabase.
- Rode `npx tsc --noEmit` antes de cada commit. Um commit por tarefa, com mensagem clara. Eu faço o `git push`.
- Registre cada decisão nova em docs/decisoes-e-conhecimento.md (entrada datada), no mesmo estilo das anteriores.
- Acesso a banco, scripts com chave do Supabase e chamadas ao Azure com PAT: eu rodo no meu computador; você me dá o comando e eu devolvo a saída.
- Não consiga chamar o Azure daqui? Escreva um script em scripts/ e me peça para rodar.
- Em ambiente com git travado ("Operation not permitted" ao apagar .git/index.lock ou HEAD.lock): mova o lock para .git/stale-<nome>-<timestamp> antes do git add e do git commit.

NÃO FAÇA:
- Não escreva em PBIs reais antes de a T02 (PAT com escrita) estar confirmada e de existir um PBI de teste.
- Não crie PBIs nem Assesments novos (só atualize os existentes).
- Não implemente Downstream, agentes, e-mails, relatórios nem os radares nesta fase. O botão "Agente de Classificação" na aba 1.1 existe sem nenhuma função.
- Não mude telas existentes (Roadmap, Gestão de Clientes, Kanban do Upstream) além do necessário para adicionar o item de menu.

PRIMEIRA SESSÃO — T01 e T02:
1. Crie scripts/azure-campos.mjs (somente leitura) que, com o PAT do .env, liste para o KMM5: todos os campos de PBI (reference name, nome, tipo, valores permitidos de Etapa e Classificação), o tipo de work item "Assesment" e seus campos (inclusive Data Comitê), a relação pai/filho entre PBI e Assesment, e a árvore de Area Paths (nó raiz KMM5 e esteiras filhas).
2. Escreva também um teste de permissão de escrita (scripts/azure-testar-escrita.mjs) que só execute contra o ID de um PBI de teste que eu informar por argumento, alterando e revertendo um campo inofensivo e criando/removendo um comentário.
3. Me dê os comandos para rodar e peça a saída. A partir dela, ajuste os reference names em um único arquivo de constantes (ex.: lib/fluxo-po-campos.ts) e registre no docs/decisoes-e-conhecimento.md.
4. Só depois disso comece T03 (módulo de regras) e T04 (leitura dos PBIs da esteira).

Antes de começar, resuma em poucas linhas o que entendeu e liste qualquer dúvida que bloqueie a T01 e a T02.
```

---

## Observações para quem for usar

- O prompt supõe que a sessão de código tem a pasta `C:\Projetos\produto-hub` conectada.
- Se a sessão de código também usar o Projeto "11. Aplicações", vale salvar `docs/fluxo-po-decisoes.md` nele para que novas sessões o encontrem.
- Os protótipos e a planilha são privados do autor. Para o time ou outra conta abrir, compartilhe pelo menu Share de cada página.

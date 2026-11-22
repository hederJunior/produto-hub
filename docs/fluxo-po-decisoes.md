# Fluxo do PO — Decisões da Fase 1 (Upstream)

Documento de decisões do novo menu **Fluxo do PO** do Produto Hub. Reúne o que foi decidido com o Heder, as regras de cada etapa, o que o sistema grava no Azure DevOps e o que fica fora da Fase 1.

- Protótipos: https://claude.ai/artifact/XDTxSVguaM7QcESeRmtNkY
- Tarefas de implementação (planilha): https://claude.ai/artifact/3N2rPnKycKNYsWpYgHWu1M
- Fluxo de Upstream (Confluence): Serviços da Carteira + Times Dedicados, Obrigações Legais e itens regulatórios, Ecossistema TNS (espaço NKL).

Os links de protótipo e planilha são privados do autor até serem compartilhados pelo menu Share de cada página.

## 1. Objetivo

Criar um item de menu que ajude o PO e o PM a operar o fluxo de trabalho, com duas telas: **Upstream** e **Downstream**. Toda ação feita na tela precisa refletir no PBI do Azure DevOps. A evolução prevista é automatizar tarefas, criar agentes que façam atividades, gerar relatórios e enviar e-mails para outros times.

## 2. Escopo da Fase 1

- Somente a tela de **Upstream**, na esteira de requisições de clientes.
- Etapas **1.1, 1.2 e 2.1** com regras de movimento e telas de detalhe.
- Etapas **3.1, 3.2 e 4.1** só aparecem no quadro, sem regras de movimento.
- Downstream, Radar Regulatório, Radar do Ecossistema, agentes, relatórios e e-mails ficam para fases seguintes.
- Somente o projeto **KMM5**. Com KMM4 selecionado a tela avisa que o fluxo existe só no KMM5.

## 3. Etapas e numeração

A etapa de Triagem (feita pelo Time de Atendimento em outra ferramenta) **não existe** no painel.

| Etapa | Nome | Responsável | Estado do PBI no Azure DevOps |
| --- | --- | --- | --- |
| 1.1 | Classificar | PM ou PO | Status Backlog, Etapa Backlog, Area KMM5 |
| 1.2 | Priorizar - Backlog da Esteira | PM ou PO | Status Backlog, Etapa Backlog, Area diferente de KMM5 |
| 2.1 | Comitê de produto / Proposta de solução | PM ou PO, com Tech Lead e QA Leader | Status Backlog, Etapa Comitê, Data Comitê preenchida |
| 3.1 | Análise de engenharia | Tech Lead, QA Leader | Status Backlog, Etapa Análise, tag "Pronto para refinamento tech" |
| 3.2 | Consolidação da proposta | PO | Status Backlog, Etapa Análise (sem a tag) |
| 4.1 | Proposta ao cliente | CS | Status Orçamento, Etapa Relacionamento/Comercial |

A coluna do card é **sempre derivada dos campos do PBI**. Mover o card grava os campos; alterar o PBI direto no Azure reposiciona o card.

## 4. Regras de movimento

### 1.1 → 1.2
Só move se:
- Area Path **diferente de KMM5** (o card entra com Area KMM5 e sai quando uma esteira é definida);
- campo **Classificação** preenchido;
- campo **Cliente** preenchido;
- campo **Data Abertura Produto** preenchido.

Grava: Status Backlog e Etapa Backlog (sem mudança), Area Path, Classificação, Cliente e Data Abertura Produto como informados, e um comentário de transição.

### 1.2 → 2.1
Só move se:
- campo **Data Comitê** preenchido.

Grava: Etapa de Backlog para **Comitê**, Status continua **Backlog**, Data Comitê, e um comentário de transição.

**Replicação para o Assesment:** ao preencher a Data Comitê do PBI, a mesma data é gravada no campo **Data Comitê** de **todos** os work items do tipo **Assesment** que são **filhos** do PBI. Se o PBI não tiver nenhum Assesment filho, o sistema **avisa e segue**, sem bloquear.

### 2.1 → 3.1 ou 3.2
O card pode ir para 3.1 ou para 3.2. Só move se:
- Data Comitê preenchida;
- Status continua Backlog.

Grava:
- **para 3.1:** Etapa Análise e tag "Pronto para refinamento tech";
- **para 3.2:** Etapa Análise, sem a tag.

### Voltar uma etapa
**PM e PO podem voltar** o card para a etapa anterior. Implementado em 2026-11-20 como **proposta** (a tela mostra o aviso "proposta" até o Heder confirmar):
- 2.1 → 1.2: Etapa de Comitê para Backlog, Data Comitê mantida.
- 1.2 → 1.1: Area Path volta para KMM5 (hoje não há outra forma de refletir "sem esteira").
Toda volta também grava comentário no PBI e entra no log.

## 5. O que o card mostra no quadro

| Coluna | Campos |
| --- | --- |
| 1.1 Classificar | Número do card (link para o Azure DevOps), título, aging, cliente |
| 1.2 Priorizar | Número (link), título, Area Path, aging, cliente, prioridade |
| 2.1 Comitê | Número (link), título, Area Path, Data Comitê (com indicativo de atraso), cliente, prioridade |
| 3.1, 3.2, 4.1 | Só exibição: número, título, Area Path, cliente, prioridade |

**Aging** = hoje menos Data Abertura Produto. Se estiver vazia, usa o Created Date. Vermelho acima de 30 dias (mesmo alerta que já existe no Backlog).

## 6. Tela de detalhe (uma aba por etapa)

Cada aba tem: checklist, quadro de informações da etapa, descrição da solicitação (campo Descrição do PBI, somente leitura), campo de comentários (publica como comentário do PBI), anexos do PBI, quadro "Quando avança", quadro "Ao avançar, grava no PBI" e histórico do PBI.

| Aba | Checklist | Informações da etapa |
| --- | --- | --- |
| 1.1 - Classificar | Fazer o entendimento da dor do cliente (preencher a classificação); Análise de aderência com a estratégia do produto; Distribuição em esteiras | Cliente, Classificação, Area Path, Data Abertura Produto |
| 1.2 - Priorizar - Backlog da Esteira | Avaliar Solicitação de cliente; Programar análise para comitê | Cliente, Classificação, Data Comitê |
| 2.1 - Comitê / Proposta de solução | Construir proposta de solução; Apresentação em comitê; Estimativa Tech; Estimativa QA; Definição de Delivery | Cliente, Classificação, Data Comitê |

Na aba 1.1, junto à descrição, há um botão **"Agente de Classificação"** sem funcionalidade nesta fase.

"Quando avança":
- 1.1: demanda classificada, com a esteira definida.
- 1.2: pós validação de requisição pelo PO e alocação para comitê/Análise.
- 2.1: pós aprovação de proposta de solução em Comitê de Produto.

## 7. Checklist, comentários e auditoria

- O **checklist** de cada etapa fica **guardado na plataforma** (quem marcou e quando).
- O sistema **registra um comentário no PBI quando o card muda de etapa** (origem, destino, usuário e data). Outras ações geram comentário em fase posterior.
- Cada movimento entra também em um log próprio da plataforma.
- Se o comentário falhar, a movimentação não é desfeita, mas a falha é registrada e avisada.

## 8. Permissões

- Movimentam os cards nas etapas 1.1, 1.2 e 2.1: quem tem o papel **PM, PO, GPM ou Product Ops** no cadastro de acesso e os usuários **tipo adm** (decisão de 2026-11-20).
- Os demais perfis só visualizam (o quadro, o detalhe, o checklist, os comentários, os anexos e o histórico ficam abertos a todos os usuários logados).
- A verificação de permissão é feita **no servidor** em toda gravação.

## 9. Controles e visibilidade incluídos no protótipo

Propostas apresentadas no protótipo, assumidas como parte da Fase 1 (ajustar se alguma não valer):
- **Prontidão no card:** "Pronto para mover" ou a lista do que falta.
- **Bloqueio com motivo:** ao soltar um card sem cumprir a regra, ele volta e aparece o motivo. Nada é gravado.
- **Contadores** de prontos e bloqueados por coluna e filtro "Somente bloqueados".
- **Cards inconsistentes:** estado fora das regras (ex.: Etapa Comitê sem Data Comitê) aparece em vermelho na coluna mais próxima.
- **Confirmação antes de gravar:** o quadro "Ao avançar, grava no PBI" resume o que será escrito.
- **Auditoria:** comentário padrão no PBI e log na plataforma.

## 10. Premissas técnicas a validar antes de gravar

**Status (2026-11-20): todas confirmadas** na T01 e na T02 (nomes dos campos, tipo Assesment, relação pai/filho, escrita do PAT, listas de Etapa e Classificação, árvore de Area Path). Detalhes e valores reais em `docs/decisoes-e-conhecimento.md` (entradas "T01" e "T02").

- Reference names reais no Azure: Etapa (`Custom.Etapa`), Classificação, Cliente (`Custom.Cliente`), PO (`Custom.PO`), Data Abertura Produto, Data Comitê (campo custom já usado em `lib/devops-client.ts`), tags e Area Path.
- Tipo do work item **Assesment** e o nome do campo Data Comitê nele; relação **filho** do PBI (Hierarchy).
- O PAT atual precisa de permissão de **leitura e escrita** em work items e comentários no KMM5.
- Lista de valores permitidos de **Etapa** e **Classificação** (usar a lista do Azure).
- A Area Path "KMM5" é o nó raiz do projeto; as esteiras são áreas filhas (Dedicada Maroni, Dedicada Transben, Projetos de Implantação, Serviços da Carteira, SWAT e outras).
- Boas práticas já conhecidas do cliente Azure do projeto: nunca incluir reference name inexistente na lista de campos do `workitemsbatch` (derruba o lote inteiro, TF51535) e conferir que a Area Path existe antes de usar `UNDER` na WIQL (TF51011).

## 11. Pendências residuais (premissas padrão até confirmação)

- Identificação de PM e PO: **papel no cadastro de acesso** da plataforma (`AllowedUser.papel`), com o **nome** também preenchido (usado no filtro "Meus itens" e na assinatura dos comentários). **Decidido.**
- Valores de Classificação: lista do Azure (lida em tempo real nos editores). Quem inclui valor novo no Azure: ainda em aberto; a validação da 1.1 → 1.2 usa a lista fixa do código (ver `docs/fluxo-po-ajustes.md`, item 6).
- Piloto: **todas as esteiras** (decisão do Heder). Roteiro em `docs/fluxo-po-piloto.md`.

## 12. Evolução prevista

1. **Fase 1:** operar o Upstream e gravar no Azure DevOps (este documento).
2. **Fase 2:** agentes que fazem atividades (Agente de Classificação, rascunho de proposta, pauta e resumo do comitê).
3. **Fase 3:** relatórios e e-mails para outros times, com aprovação e registro no PBI.
4. **Fase 4:** Downstream, Radar Regulatório e Radar do Ecossistema.

## 13. Fluxo de Upstream que originou isto (resumo)

- **Requisições de clientes:** Triagem (Atendimento), Classificação em esteira (PM), Priorização e proposta (PO), Comitê, Análise de engenharia, Consolidação da proposta e Proposta ao cliente (CS).
- **Regra de priorização por esteira:** SWAT/Melhorias por GUT; Regulatória pela data de implantação da obrigação legal; TNS/Integrações por Road Map/SLA; Projetos de Implantação junto à PMO; Serviços cliente por SLA de Viabilidade.
- **Atalhos:** SWAT crítica, integrações com embarcadores, integrações padrão e tarefas técnicas podem ir direto para a análise tech. Obrigações legais, SWAT e itens do ecossistema que seguem o roadmap não vão para Orçamento.
- **Obrigações Legais e Ecossistema TNS:** são fluxos próprios (registro no Confluence, desdobramento em Épico, Feature e PBI no Azure, Now/Next/Later) previstos para fase posterior.

## 14. Estado da Fase 1 (implementada em 2026-11-20)

Menu **Fluxo do PO** com as abas Upstream e Downstream (Downstream mostra "em construção"). Tudo o que está neste documento para o Upstream foi implementado:

- **Quadro** com as 6 colunas, cards por coluna, aging (vermelho acima de 30 dias), Data Comitê com indicativo de atraso, prontidão ("Pronto para mover" ou o que falta), contadores de prontos e bloqueados, filtros de esteira, "Meus itens" e "Somente bloqueados", botão **Atualizar** e atualização ao voltar para a tela.
- **Mover** por arrastar ou pelo botão, com confirmação do que será gravado, motivo do bloqueio e escolha 3.1 ou 3.2 na 2.1; comentário de transição no PBI; Data Comitê copiada para os Assesments filhos; log de todas as tentativas; controle de revisão (conflito = 409).
- **Detalhe** (`/fluxo-po/<id>`) com uma aba por etapa, faixa de prontidão, informações editáveis (listas do Azure), checklist, descrição, comentários (com publicação), anexos, histórico do PBI e dos movimentos, quadros "Quando avança" e "Ao avançar, grava no PBI", e o botão "Agente de Classificação" sem função na aba 1.1.
- **Permissões** verificadas no servidor em toda gravação; aviso quando o PBI muda no Azure enquanto a tela está aberta; conflito por campo ao salvar.

**Ainda em aberto, dependem do Heder:** (1) confirmar o que cada **volta** grava (2.1 → 1.2 e 1.2 → 1.1) para retirar o aviso "proposta"; (2) onde fica o **card inconsistente** (Etapa Comitê sem Data Comitê: hoje na 2.1, em vermelho); (3) quem recebe papel e nome no cadastro de acesso para o piloto.

Documentos desta fase: `docs/fluxo-po-guia-de-uso.md` (para PM e PO), `docs/fluxo-po-piloto.md` (roteiro do piloto), `docs/fluxo-po-ajustes.md` (ajustes priorizados), `docs/fluxo-po-publicacao.md` (checklist de publicação) e o histórico técnico em `docs/decisoes-e-conhecimento.md` (entradas "Fluxo do PO · T01 a T22").

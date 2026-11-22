# Fluxo do PO — Ajustes e evoluções (priorizados)

Lista viva, montada com o que apareceu na construção e nos testes da Fase 1. Prioridade: **P1** = resolver antes ou durante o piloto; **P2** = logo após o piloto; **P3** = fases seguintes. Esforço: **P**equeno (≤ 1 dia), **M**édio (2–4 dias), **G**rande (> 1 semana).

| # | Prio | Ajuste | Por quê (evidência) | Esforço |
| --- | --- | --- | --- | --- |
| 1 | ✅ feito em 22/11/2026 | **Preencher o que falta na própria confirmação de mover** (Data Comitê na 1.2; esteira, classificação, cliente e data de abertura na 1.1) | 108 dos 122 cards da 1.2 só avançam depois de alguém preencher a Data Comitê, e hoje é preciso abrir o detalhe card a card. O servidor **já aceita** esses valores no movimento; falta o formulário na confirmação | M |
| 2 | **P1** | **Decidir a volta de etapa**: o que 2.1 → 1.2 e 1.2 → 1.1 gravam (hoje: Etapa → Backlog mantendo a Data Comitê; Area Path → KMM5) | Está como "proposta" (aviso na tela) e como Pendente na planilha de decisões. Tirar o aviso depois de confirmar | P |
| 3 | **P1** | **Decidir o card inconsistente** (Etapa Comitê sem Data Comitê): fica na 2.1 em vermelho (hoje) ou vai para a 1.2 | 2 cards reais (#38790 e #40933) estão assim; Pendente na planilha | P |
| 4 | **P1** | **Cadastrar papel e nome** dos participantes (script `adicionar-acesso.mjs --nome --papel`) | Hoje só 2 de 17 cadastrados movimentam (as duas administradoras) e 16 não têm nome; "Meus itens" e a assinatura dos comentários dependem do nome | P |
| 5 | **P1** | **Teste ponta a ponta com login real** no primeiro dia do piloto | Todos os testes usaram usuário simulado ou chamaram as funções das rotas; a sessão real do Supabase (link mágico) nunca foi exercitada nas telas novas | P |
| 6 | ✅ feito em 22/11/2026 | **Validar a Classificação pela lista do Azure**, não pela lista fixa do código, na 1.1 → 1.2 (a confirmação e o servidor usam a lista de agora; a fixa só vale sem a lista) | Se o Azure ganhar um valor novo, a validação do código o recusaria (os editores já leem a lista do Azure em tempo real) | P |
| 7 | P2 | **Tela de gestão de acessos** na Administração (papel e nome sem script) | Hoje o cadastro é por linha de comando; há dois e-mails parecidos (`catrini.olkowski` / `catrini.olkwoski`) que vale conferir | M |
| 8 | P2 | **Preenchimento em lote** da Data Comitê (selecionar vários cards da 1.2 e dar a mesma data de comitê) | Consequência do item 1: o comitê costuma reunir vários cards | M |
| 9 | P2 | **Limpar a Data Comitê também limpa os Assesments filhos?** (hoje não: eles mantêm a data anterior e a tela avisa) | Decisão de negócio ainda não tomada | P |
| 10 | P2 | **Casamento do filtro "Meus itens"** por e-mail do Azure em vez de só por nome | O PO no Azure é texto livre; nomes com poucos sobrenomes não casam (ex.: cadastro "Heder" × Azure "Heder Luiz Martins Junior") | M |
| 11 | P2 | **Busca por texto** no quadro e filtros por Classificação e Cliente | 172 cards hoje, tende a crescer | M |
| 12 | P2 | **Autoria das alterações no Azure**: hoje tudo aparece como feito pelo dono do PAT (mitigado pelo nome no texto dos comentários e pelo log da plataforma) | Quem consulta só o Azure não vê quem fez; solução definitiva é gravar com a identidade de cada usuário (OAuth do Azure DevOps) ou manter o log como fonte de auditoria | G |
| 13 | P2 | **Alerta de validade do PAT** do Azure (o PAT expira; quando expira, todo o fluxo para de gravar) | O sistema só mostra "credencial inválida ou expirada" no momento do erro | P |
| 14 | P2 | **Atualização periódica** do quadro aberto (hoje: botão e ao voltar para a tela) | Quadro aberto o dia todo pode ficar velho | P |
| 15 | P2 | **Acessibilidade do arrastar**: o botão "Mover" já cobre teclado e toque; revisar foco e leitura de tela | O arrastar é só com mouse | P |
| 16 | P3 | **Checklist obrigatório para avançar** (hoje é apoio e não bloqueia) | Definir se algum item deve travar o movimento | P |
| 17 | P3 | **Regras de movimento para 3.1, 3.2 e 4.1** e o **Downstream** | Previsto para as próximas fases; hoje só exibição | G |
| 18 | P3 | **Notificações** (e-mail/Teams) ao mover para o Comitê ou para a Análise | Fase 3 do roadmap | M |
| 19 | P3 | **Relatórios** com o log de movimentos (tempo em cada etapa, gargalos por esteira) | Os dados já estão em `FluxoPoMovimento` | M |
| 20 | P3 | **Agente de Classificação** (o botão já existe, sem função) e demais agentes | Fase 2 do roadmap | G |
| 21 | P3 | **Teste automatizado das telas** (navegador) e do login real | Hoje só unitários e integração das funções (113 verificações) | M |
| 22 | P3 | **KMM4** no fluxo | Decisão atual: só KMM5 | G |

## Limites conhecidos (não são defeitos)

- Comentários, edições e movimentos aparecem no Azure como feitos pelo dono do PAT (item 12); um comentário de outra pessoa no Azure aparece na tela como "PBI alterado", porque é uma revisão nova.
- O quadro lê até o que a consulta do Azure devolver (hoje ~170 cards, bem abaixo do limite de 20 mil).
- Datas de comitê são gravadas como meia-noite de Brasília (`T03:00:00Z`), igual ao que o próprio Azure grava.

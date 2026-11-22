# Fluxo do PO — Guia de uso (PM e PO)

Para quem opera o fluxo de requisições de clientes no Produto Hub. Tudo o que você faz aqui é gravado no PBI do Azure DevOps (projeto **KMM5**); o quadro sempre reflete o que está no Azure.

## 1. Quem pode fazer o quê

| Perfil | O que pode |
| --- | --- |
| **PM, PO, GPM, Product Ops** (papel no cadastro de acesso) e **administradores** | Mover cards, editar as informações do PBI, marcar o checklist e publicar comentários |
| Os demais | Ver tudo (quadro, detalhe, checklist, comentários, anexos, histórico), sem alterar |

No canto direito do quadro há um selo: **"Você pode movimentar"** ou **"Somente visualização"** (passe o mouse para ver o motivo). Se o seu selo estiver errado, peça ao administrador para ajustar o seu **papel** e o seu **nome** no cadastro de acesso.

## 2. As etapas e onde o card aparece

A coluna do card é **sempre calculada pelos campos do PBI**. Mover o card grava os campos; mudar o PBI direto no Azure DevOps também muda a coluna (use **Atualizar**).

| Etapa | Nome | O PBI está assim no Azure |
| --- | --- | --- |
| **1.1** | Classificar | Status Backlog · Etapa Backlog · Area Path **KMM5** (sem esteira) |
| **1.2** | Priorizar - Backlog da Esteira | Status Backlog · Etapa Backlog · Area Path de uma **esteira** |
| **2.1** | Comitê / Proposta de solução | Status Backlog · Etapa **Comitê** · Data Comitê preenchida |
| 3.1 | Análise de engenharia | Status Backlog · Etapa **Análise** · tag "Pronto para refinamento tech" |
| 3.2 | Consolidação da proposta | Status Backlog · Etapa **Análise** · sem a tag |
| 4.1 | Proposta ao cliente | Status **Orçamento** · Etapa Relacionamento/Comercial |

As etapas **3.1, 3.2 e 4.1 são só de exibição** nesta fase (não dá para mover a partir delas). A Triagem não existe no painel. O fluxo existe **só no KMM5**: com KMM4 selecionado no filtro Produto, a tela avisa.

## 3. O quadro

- **Cards** mostram o número (clique abre o PBI no Azure), o título, o cliente, o **PO** (a partir da 1.2) e, conforme a coluna: esteira (Area Path), prioridade, **aging** (dias desde a Data Abertura Produto; **vermelho acima de 30**) e, na 2.1, a **Data Comitê** (vermelho com "Atrasada" quando já passou).
- **Prontidão:** o card diz **"Pronto para mover"** ou **"Falta: …"** (por exemplo, "Falta: Data Comitê"). Cards em vermelho com "Inconsistente" têm um estado fora das regras (hoje: Etapa Comitê sem Data Comitê).
- **Contadores** no topo de cada coluna: quantos cards estão prontos e quantos bloqueados.
- **Filtros:** *Esteira* (escolha **uma ou mais**; mostra as esteiras escolhidas **e** os cards da raiz KMM5, que ainda não têm esteira), *Meus itens* (PBIs em que você é o PO ou o responsável; precisa do seu **nome** no cadastro) e *Somente bloqueados*.
- Os filtros ficam **guardados na sessão do navegador**: ao abrir o detalhe de um card e voltar, o quadro mantém os mesmos filtros (e a aba Upstream/Downstream). Fechar a aba do navegador limpa tudo.
- **Atualizar:** botão no topo. O quadro também se atualiza sozinho quando você volta para a tela depois de mais de 30 segundos.
- **Detalhes:** botão em cada card, abre a tela do PBI.

## 4. Mover um card

1. **Arraste** o card para a coluna de destino (as colunas possíveis se destacam) **ou** clique em **Mover** no card e escolha o destino.
2. Abre a **confirmação**. Ela mostra o que será gravado no PBI ("Ao avançar, grava no PBI"). Na 2.1 você escolhe **3.1** ou **3.2**.
3. **Confirmar e gravar.** O card muda de coluna, o sistema publica um comentário no PBI e registra o movimento.

**O Cliente é obrigatório em qualquer movimento** (avançar ou voltar).

**Se falta algum campo, você preenche na própria confirmação:** ela mostra "Falta preencher para mover" com só os campos que o card ainda não tem (esteira, Classificação, Cliente, Data Abertura Produto ou Data Comitê, conforme o movimento), com as listas do Azure. Os valores são gravados no PBI **junto com o movimento**, e o quadro "Ao avançar, grava no PBI" mostra tudo antes de você confirmar. Enquanto algo estiver faltando ou inválido, o botão fica desabilitado e **nada é gravado** — o card continua onde estava.

| Movimento | O que precisa estar preenchido | O que é gravado |
| --- | --- | --- |
| **1.1 → 1.2** | Esteira definida (Area Path diferente de KMM5), Classificação, Cliente, Data Abertura Produto | Area Path, Classificação, Cliente e Data Abertura Produto como informados; Status e Etapa seguem Backlog |
| **1.2 → 2.1** | Cliente e Data Comitê | Etapa Backlog → Comitê (Status segue Backlog), Data Comitê, e **a Data Comitê é copiada para todos os Assesments filhos** (sem filho, o sistema avisa e segue) |
| **2.1 → 3.1** | Cliente e Data Comitê | Etapa Análise + tag "Pronto para refinamento tech" |
| **2.1 → 3.2** | Cliente e Data Comitê | Etapa Análise, sem a tag |

**Voltar uma etapa** é permitido a quem movimenta, como **proposta** (a tela mostra o aviso): 2.1 → 1.2 volta a Etapa para Backlog e mantém a Data Comitê; 1.2 → 1.1 volta o Area Path para KMM5.

Se outra pessoa mexer no PBI na hora em que você grava, o sistema recusa com a mensagem para atualizar o quadro, sem sobrescrever nada.

## 5. A tela de detalhe de um PBI

Abra por **Detalhes** no card. No topo: número, título, etapa atual, cliente, **PO**, esteira e aging. Há **uma aba por etapa** (1.1, 1.2, 2.1); a aba aberta é a da etapa atual. A **faixa de prontidão** diz se o card está pronto ou o que falta, e tem o botão **Mover card…**.

- **Informações da etapa** (editáveis para quem movimenta): Cliente, Classificação, Area Path (esteira), Data Abertura Produto e Data Comitê, com as **listas do próprio Azure**. Clique em **Salvar informações** para gravar no PBI. Ao salvar uma **Data Comitê**, ela é copiada para os Assesments filhos. Mudar o Area Path pode trocar o card de coluna (a tela avisa).
- **Checklist da etapa:** marque os itens; fica registrado **quem marcou e quando**. É um apoio: **não bloqueia** o movimento.
- **Descrição da solicitação:** somente leitura. Na aba **1.1** há o botão **Agente de Classificação**, ainda **sem função** (chega numa fase seguinte).
- **Cancelamento de Demanda** (só na aba **1.1**, entre a descrição e os comentários; só para quem movimenta): escolha um dos 7 motivos (fora de priorização do produto, Torre de Controle, ERP, TNS, Obrigação Legal, Excesso de demandas, Usuário não liberado para abertura de demanda). O **texto padrão** do motivo aparece para você revisar e editar; ao clicar em **Publicar comentário e cancelar demanda**, o texto vai como comentário no PBI e o **Status passa para Cancelado** (o card sai do quadro). Não exige Cliente e não vale para cards já na 1.2 ou além. **Atenção:** a integração do GLPI reage ao Status Cancelado e posta no PBI a mensagem "A demanda já foi cancelada…" (ver o histórico de decisões); para desfazer, altere o Status no Azure DevOps.
- **Comentários:** veja os do PBI e publique novos. No Azure o autor aparece como o da integração; o seu nome e a data vão no texto ("via Produto Hub").
- **Anexos** do PBI (abrem no Azure) e **Histórico**: "PBI no Azure" (as alterações) e "Movimentos na plataforma" (quem moveu o card, quando, o resultado e os avisos).
- **Quando avança** e **Ao avançar, grava no PBI**: lembrete da regra de cada etapa.

**Aviso de PBI alterado:** se alguém alterar o PBI no Azure enquanto você está com o detalhe aberto, aparece um aviso amarelo. Se você tentar salvar um campo que a outra pessoa também mudou, o sistema **não grava** e mostra o que mudou, para você escolher entre atualizar (descartando o seu rascunho) ou continuar editando.

## 6. Perguntas frequentes

**Por que não consigo mover?** Confira o selo no quadro: se estiver "Somente visualização", o seu papel no cadastro de acesso não é PM, PO, GPM ou Product Ops. Se você pode mover mas o card não vai, a confirmação mostra o que falta.

**Meu card não aparece.** Só entram PBIs do KMM5, tipo Product Backlog Item, em Backlog com Etapa Backlog, Comitê ou Análise, ou em Orçamento com Etapa Relacionamento/Comercial. Outros estados (Execução, Finalizado...) ficam fora do fluxo.

**"Meus itens" não mostra nada.** O filtro compara o seu **nome** (e e-mail) do cadastro de acesso com o PO e o responsável do PBI. Sem nome cadastrado, ou com um nome muito diferente do que está no Azure, ele fica vazio.

**O comentário e as alterações aparecem no Azure como feitos por outra pessoa.** É esperado: o Produto Hub grava com a credencial da integração. O **seu nome** vai no texto do comentário e fica no histórico "Movimentos na plataforma".

**O card voltou para outra coluna depois de eu salvar o Area Path.** A coluna 1.1 é "Area Path = KMM5" e a 1.2 é "Area Path de uma esteira"; a tela avisa antes de gravar.

**Errei um movimento.** Quem movimenta pode voltar uma etapa (como proposta). Para qualquer outro ajuste, edite o PBI no Azure ou fale com o Heder.

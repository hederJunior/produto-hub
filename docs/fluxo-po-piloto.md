# Fluxo do PO — Plano do piloto

Piloto da Fase 1 (Upstream) com **PM e PO**, em **todas as esteiras** (decisão do Heder). O piloto escreve em PBIs reais do KMM5: por isso começa com um ensaio no PBI de teste.

## 1. Antes de começar (pré-requisitos)

1. Publicação feita e conferida (`docs/fluxo-po-publicacao.md`, incluindo o teste com login real).
2. **Quem participa tem papel e nome no cadastro de acesso** (PM, PO, GPM ou Product Ops; o nome parecido com o do Azure DevOps). Sem isso a pessoa só visualiza e o filtro "Meus itens" fica vazio.
3. Cada participante leu o **guia de uso** (`docs/fluxo-po-guia-de-uso.md`, 10 minutos).
4. Decisões ainda abertas combinadas com o Heder antes do primeiro dia (ou aceitas como estão): regra da **volta** e **card inconsistente** (ver `docs/fluxo-po-ajustes.md`, itens 2 e 3).

## 2. Retrato do quadro no início (20/11/2026, para comparar depois)

172 cards no KMM5: **1.1 = 17**, **1.2 = 122**, **2.1 = 13** (2 inconsistentes: Etapa Comitê sem Data Comitê), 3.1 = 8, 3.2 = 1, 4.1 = 11. Na 1.2, **14 estão prontos e 108 bloqueados** (falta Data Comitê); na 1.1 os 17 precisam de esteira.
Isso é esperado: ninguém tinha definido o comitê desses cards. O piloto mostra, na prática, o ritmo de preenchimento.

## 3. Roteiro (cada participante, na primeira semana)

**Dia 1 — ensaio (PBI de teste 46766, ou outro PBI combinado como teste):**

| # | Cenário | Resultado esperado |
| --- | --- | --- |
| 1 | Abrir **Fluxo do PO > Upstream** | O quadro carrega; o selo mostra "Você pode movimentar" |
| 2 | Filtrar por **esteira**, **Meus itens** e **Somente bloqueados** | Os números batem com o que você espera da sua carteira |
| 3 | Abrir **Detalhes** de um card, trocar de aba, marcar um item do **checklist** | Aparece "Marcado por <seu nome> em <data>" |
| 4 | Editar **Classificação/Cliente/Data Comitê** no detalhe e salvar | O PBI muda no Azure; a Data Comitê aparece nos Assesments filhos |
| 5 | **Mover 1.2 → 2.1** (com Data Comitê) | O card vai para a 2.1; há um comentário de transição no PBI; o movimento aparece em "Movimentos na plataforma" |
| 6 | Tentar mover um card **sem os campos** | A confirmação mostra o motivo e nada é gravado |
| 7 | **Voltar** o card (2.1 → 1.2) | A Etapa volta para Backlog e a Data Comitê fica (aviso "proposta") |
| 8 | Publicar um **comentário** no detalhe | Aparece no PBI com o seu nome e "via Produto Hub" |
| 9 | Alterar o PBI no Azure com o detalhe aberto | Aparece o aviso amarelo de PBI alterado |

**Dias seguintes — uso real:** classificar a fila da 1.1, priorizar a 1.2 e levar cards ao comitê (2.1), registrando cada dúvida ou travamento.

## 4. O que medir

Tudo sai do log da plataforma (tabela `FluxoPoMovimento`), sem trabalho manual. No SQL Editor do Supabase:

```sql
-- movimentos por resultado e por tipo, desde o início do piloto
select "resultado", "direcao", count(*) as total
from "FluxoPoMovimento"
where "criadoEm" >= '2026-11-21'  -- ajuste para a data de início do piloto
group by 1, 2 order by total desc;

-- motivos de bloqueio mais frequentes (o que mais trava os cards)
select "motivo", count(*) as vezes
from "FluxoPoMovimento"
where "resultado" in ('bloqueado', 'conflito') and "criadoEm" >= '2026-11-21'
group by 1 order by vezes desc limit 15;

-- quem moveu mais
select coalesce("usuarioNome", "usuario") as quem, count(*) as movimentos
from "FluxoPoMovimento"
where "resultado" in ('sucesso', 'parcial') and "direcao" in ('avanco', 'volta') and "criadoEm" >= '2026-11-21'
group by 1 order by movimentos desc;
```

Indicadores sugeridos: cards movidos por semana e por esteira; % de tentativas bloqueadas (e por quê); quantas vezes se voltou uma etapa (sinal de dúvida sobre a regra); conflitos (alguém mexeu no Azure ao mesmo tempo); evolução dos contadores "prontos/bloqueados" das colunas 1.2 e 2.1.

## 5. Como registrar ajustes

Cada participante anota na planilha de tarefas, aba de ajustes (ou direto no Heder): **o que tentou fazer, o que aconteceu, o que esperava** e, se der, o número do PBI. O Heder prioriza junto com a lista de `docs/fluxo-po-ajustes.md`.

## 6. Critério para encerrar o piloto

- Nenhum erro bloqueante aberto (nada gravado errado no Azure, nada que impeça mover um card que cumpre a regra).
- As duas decisões abertas (volta e card inconsistente) fechadas e o aviso "proposta" retirado, se for o caso.
- PM e PO conseguem operar a esteira sem ajuda no segundo dia.
- Lista de ajustes priorizada e com responsável. Só então avançar para as próximas fases (etapas 3.1/3.2/4.1 com regras, Downstream, agentes).

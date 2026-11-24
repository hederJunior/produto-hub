// Testes das ordenações da Gestão de clientes. Rodar: npm run test:gestao-clientes
import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveDaListagem, ordenarBacklog, ordenarExecucao, ordenarListagem } from "./gestao-clientes";

const pbi = (id: number, state: string, etapa: string) => ({ id, state, etapa });
const rotulo = (p: { state: string; etapa: string }) => `${p.state}|${p.etapa}`;

test("listagem: ordem status | etapa pedida (11 grupos)", () => {
  const esperado = [
    "Backlog|Backlog",
    "Backlog|Comitê",
    "Backlog|Análise",
    "Orçamento|Relacionamento Comercial",
    "Execução|Aguardando Priorização",
    "Execução|Relacionamento Comercial",
    "Execução|Análise",
    "Execução|Execução",
    "Execução|Validação Interna",
    "Teste Aceite Usuário|Delivery",
    "Aguardando Deploy|Delivery",
  ];
  // entrega embaralhada (ids decrescentes) e confere a ordem final
  const embaralhados = [...esperado].reverse().map((r, i) => pbi(100 - i, ...(r.split("|") as [string, string])));
  assert.deepEqual(ordenarListagem(embaralhados).map(rotulo), esperado);
});

test("listagem: ignora acento/caixa e desempata por ID crescente", () => {
  const r = ordenarListagem([pbi(9, "execucao", "analise"), pbi(3, "EXECUÇÃO", "ANÁLISE"), pbi(5, "Backlog", "comite")]);
  assert.deepEqual(r.map((p) => p.id), [5, 3, 9]);
});

test("listagem: etapa fora da lista vai depois das conhecidas do mesmo status; status desconhecido vai ao fim", () => {
  const r = ordenarListagem([pbi(1, "Cancelado", "Backlog"), pbi(2, "Execução", "Etapa nova"), pbi(3, "Execução", "Validação Interna"), pbi(4, "Backlog", "Backlog")]);
  assert.deepEqual(r.map((p) => p.id), [4, 3, 2, 1]);
  assert.ok(chaveDaListagem(pbi(0, "Execução", "Etapa nova")) < chaveDaListagem(pbi(0, "Teste Aceite Usuário", "Delivery")));
});

test("backlog: Comitê antes de Backlog (e Análise por último)", () => {
  const r = ordenarBacklog([pbi(1, "Backlog", "Backlog"), pbi(2, "Backlog", "Análise"), pbi(3, "Backlog", "Comitê"), pbi(4, "Backlog", "Backlog"), pbi(5, "Backlog", "Comitê")]);
  assert.deepEqual(r.map((p) => `${p.etapa}:${p.id}`), ["Comitê:3", "Comitê:5", "Backlog:1", "Backlog:4", "Análise:2"]);
});

test("execução: Análise, Execução, Validação Interna; demais etapas no fim", () => {
  const r = ordenarExecucao([
    pbi(1, "Execução", "Validação Interna"),
    pbi(2, "Execução", "Relacionamento Comercial"),
    pbi(3, "Execução", "Execução"),
    pbi(4, "Execução", "Aguardando Priorização"),
    pbi(5, "Execução", "Análise"),
  ]);
  assert.deepEqual(r.map((p) => p.id), [5, 3, 1, 4, 2]);
});

test("não altera a lista de entrada", () => {
  const entrada = [pbi(2, "Execução", "Execução"), pbi(1, "Backlog", "Backlog")];
  ordenarListagem(entrada);
  ordenarBacklog(entrada);
  ordenarExecucao(entrada);
  assert.deepEqual(entrada.map((p) => p.id), [2, 1]);
});

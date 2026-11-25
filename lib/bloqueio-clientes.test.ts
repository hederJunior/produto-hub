// Testes da regra "Bloqueado para novas demandas". Rodar: npm run test:bloqueio-clientes
import { test } from "node:test";
import assert from "node:assert/strict";
import { acharBloqueio, avaliarBloqueios, descreverMotivos } from "./bloqueio-clientes";
import type { PbiGestaoCliente } from "./gestao-clientes";

let seq = 1;
const pbi = (cliente: string, state: string, etapa = "Backlog"): PbiGestaoCliente => ({
  id: seq++,
  projeto: "KMM5",
  idExterno: "",
  titulo: "t",
  state,
  etapa,
  po: "",
  areaPath: "KMM5\\Squad",
  cliente,
  createdDate: "2026-01-01T00:00:00Z",
  dataAberturaProduto: null,
  classificacao: "",
  dataComite: null,
  effort: null,
  estimativaTotal: null,
  dataAtivacao: null,
  qtdComentarios: 0,
});
const varios = (n: number, ...args: [string, string, string?]) => Array.from({ length: n }, () => pbi(...args));
const de = (itens: PbiGestaoCliente[], cliente: string) => avaliarBloqueios(itens).find((b) => b.cliente === cliente)!;

test("3 demandas em Backlog bloqueiam; 2 não", () => {
  assert.equal(de(varios(3, "A", "Backlog", "Comitê"), "A").bloqueado, true);
  assert.equal(de(varios(2, "A", "Backlog", "Comitê"), "A").bloqueado, false);
});

test("Backlog conta só as etapas Backlog, Análise e Comitê (mesma regra da tela)", () => {
  const itens = [pbi("A", "Backlog", "Backlog"), pbi("A", "Backlog", "Análise"), pbi("A", "Backlog", "Comitê"), pbi("A", "Backlog", "Relacionamento Comercial")];
  const r = de(itens, "A");
  assert.equal(r.qtdBacklog, 3);
  assert.deepEqual(r.motivos, ["backlog"]);
});

test("3 em Execução ou 3 em HML (Teste Aceite Usuário) bloqueiam, cada um por si", () => {
  assert.deepEqual(de(varios(3, "A", "Execução", "Análise"), "A").motivos, ["execucao"]);
  assert.deepEqual(de(varios(3, "A", "Teste Aceite Usuário", "Delivery"), "A").motivos, ["hml"]);
});

test("as contagens NÃO se somam entre status: 2 + 2 + 2 não bloqueia", () => {
  const itens = [...varios(2, "A", "Backlog", "Backlog"), ...varios(2, "A", "Execução", "Execução"), ...varios(2, "A", "Teste Aceite Usuário", "Delivery")];
  const r = de(itens, "A");
  assert.equal(r.bloqueado, false);
  assert.deepEqual([r.qtdBacklog, r.qtdExecucao, r.qtdHml], [2, 2, 2]);
});

test("mais de um motivo aparece na ordem backlog, execução, HML", () => {
  const itens = [...varios(4, "A", "Backlog", "Backlog"), ...varios(3, "A", "Teste Aceite Usuário", "Delivery"), ...varios(1, "A", "Execução", "Execução")];
  const r = de(itens, "A");
  assert.deepEqual(r.motivos, ["backlog", "hml"]);
  assert.equal(descreverMotivos(r), "4 demandas em Backlog · 3 em HML com cliente");
});

test("Orçamento e Aguardando Deploy não entram na conta", () => {
  const r = de([...varios(5, "A", "Orçamento", "Relacionamento Comercial"), ...varios(5, "A", "Aguardando Deploy", "Delivery"), pbi("A", "Backlog", "Backlog")], "A");
  assert.equal(r.bloqueado, false);
  assert.deepEqual([r.qtdBacklog, r.qtdExecucao, r.qtdHml], [1, 0, 0]);
});

test("KMM (INTERNO) e PBI sem cliente ficam de fora; clientes são separados", () => {
  const itens = [...varios(5, "KMM (INTERNO)", "Backlog", "Backlog"), ...varios(5, "", "Execução", "Execução"), ...varios(3, "B", "Execução", "Execução"), pbi("C", "Execução", "Execução")];
  const r = avaliarBloqueios(itens);
  assert.deepEqual(r.map((b) => `${b.cliente}:${b.bloqueado}`), ["B:true", "C:false"]);
});

test("acharBloqueio ignora acento e caixa", () => {
  const lista = [{ cliente: "Comércio São José" }];
  assert.equal(acharBloqueio(lista, "comercio sao jose")?.cliente, "Comércio São José");
  assert.equal(acharBloqueio(lista, ""), undefined);
  assert.equal(acharBloqueio(lista, "outro"), undefined);
});

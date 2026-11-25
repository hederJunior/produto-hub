// Testes do gráfico "Estimativa Total × 1,25 por mês". Rodar: npm run test:estimativa-mensal
import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparEstimativaPorMes, entraNoCalculo, mesDaAtivacao, rotuloCurtoDoMes, rotuloLongoDoMes, serieDoGrafico } from "./estimativa-mensal";
import type { PbiGestaoCliente } from "./gestao-clientes";

let seq = 1;
const pbi = (estimativaTotal: number | null, dataAtivacao: string | null): PbiGestaoCliente => ({
  id: seq++,
  projeto: "KMM5",
  idExterno: "",
  titulo: "t",
  state: "Execução",
  etapa: "Execução",
  po: "",
  areaPath: "KMM5\\Squad",
  cliente: "A",
  createdDate: "2026-01-01T00:00:00Z",
  dataAberturaProduto: null,
  classificacao: "",
  dataComite: null,
  effort: null,
  estimativaTotal,
  dataAtivacao,
  qtdComentarios: 0,
});

test("soma por mês de ativação e aplica o fator 1,25", () => {
  const { meses, semDados } = agruparEstimativaPorMes([pbi(10, "2026-10-05T12:00:00Z"), pbi(30, "2026-10-20T12:00:00Z"), pbi(8, "2026-11-02T12:00:00Z")]);
  assert.equal(semDados, 0);
  assert.deepEqual(meses.map((m) => [m.mes, m.bruto, m.horas, m.itens.length]), [
    ["2026-10", 40, 50, 2],
    ["2026-11", 8, 10, 1],
  ]);
});

test("o mês é o de Brasília: 01/11 às 01:00 UTC ainda é outubro (22:00 do dia 31)", () => {
  assert.equal(mesDaAtivacao("2026-11-01T01:00:00Z"), "2026-10");
  assert.equal(mesDaAtivacao("2026-11-01T03:00:00Z"), "2026-11");
});

test("sem Estimativa Total ou sem Activated Date ficam de fora e são contados; Estimativa 0 entra", () => {
  const itens = [pbi(null, "2026-11-02T12:00:00Z"), pbi(5, null), pbi(5, "lixo"), pbi(0, "2026-11-02T12:00:00Z")];
  assert.deepEqual(itens.map(entraNoCalculo), [false, false, false, true]);
  const { meses, semDados } = agruparEstimativaPorMes(itens);
  assert.equal(semDados, 3);
  assert.deepEqual(meses.map((m) => [m.mes, m.horas]), [["2026-11", 0]]);
});

test("série do gráfico: janela de 12 meses, sem buracos, começando no 1º mês com dado", () => {
  const { meses } = agruparEstimativaPorMes([pbi(8, "2026-08-10T12:00:00Z"), pbi(4, "2026-11-10T12:00:00Z"), pbi(100, "2025-01-10T12:00:00Z")]);
  const serie = serieDoGrafico(meses, new Date("2026-11-24T15:00:00Z"));
  assert.deepEqual(serie.map((m) => [m.mes, m.horas]), [
    ["2026-08", 10],
    ["2026-09", 0],
    ["2026-10", 0],
    ["2026-11", 5],
  ]);
});

test("série do gráfico: mês muito antigo cai fora da janela; sem dado na janela = vazia; cruza o ano", () => {
  const { meses } = agruparEstimativaPorMes([pbi(8, "2025-01-10T12:00:00Z")]);
  assert.deepEqual(serieDoGrafico(meses, new Date("2026-11-24T15:00:00Z")), []);
  const { meses: m2 } = agruparEstimativaPorMes([pbi(8, "2025-12-10T12:00:00Z")]);
  assert.deepEqual(serieDoGrafico(m2, new Date("2026-02-10T15:00:00Z")).map((m) => m.mes), ["2025-12", "2026-01", "2026-02"]);
});

test("rótulos dos meses", () => {
  assert.equal(rotuloCurtoDoMes("2026-11"), "nov/26");
  assert.equal(rotuloLongoDoMes("2026-03"), "março de 2026");
});

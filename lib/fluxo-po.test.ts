// Testes das regras puras do Fluxo do PO. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adicionarTag,
  agingEmAlerta,
  agingEmDias,
  avaliarMovimento,
  comentarioDeTransicao,
  comiteAtrasado,
  agruparPorEtapa,
  contarPorEtapa,
  derivarEtapa,
  destinosPossiveis,
  paraJsonPatch,
  montarCards,
  podeMovimentar,
  projetoSuportado,
  prontidaoDoCard,
  removerTag,
  type PbiFluxo,
} from "./fluxo-po";

const TAG = "Pronto para refinamento tech";

function pbi(parcial: Partial<PbiFluxo> = {}): PbiFluxo {
  return {
    id: 1,
    titulo: "PBI de teste",
    status: "Backlog",
    etapa: "Backlog",
    areaPath: "KMM5",
    tags: "",
    cliente: "",
    classificacao: "",
    dataAberturaProduto: null,
    dataComite: null,
    prioridade: null,
    criadoEm: "2026-10-01T10:00:00Z",
    rev: 7,
    ...parcial,
  };
}

const pbi12 = (p: Partial<PbiFluxo> = {}) =>
  pbi({ areaPath: "KMM5\\TMS - Dedicada Maroni", cliente: "MARONI", classificacao: "EDI", dataAberturaProduto: "2026-11-01T00:00:00Z", ...p });
const pbi21 = (p: Partial<PbiFluxo> = {}) => pbi12({ etapa: "Comitê", dataComite: "2026-12-10T00:00:00Z", ...p });

// ---------------------------------------------------------------- derivação da etapa

test("derivarEtapa: 1.1 = Backlog/Backlog na raiz KMM5", () => {
  assert.deepEqual(derivarEtapa(pbi()), { etapa: "1.1", inconsistencia: null });
  assert.equal(derivarEtapa(pbi({ areaPath: " kmm5 " })).etapa, "1.1");
});

test("derivarEtapa: 1.2 = Backlog/Backlog em área filha", () => {
  assert.equal(derivarEtapa(pbi12()).etapa, "1.2");
});

test("derivarEtapa: 2.1 = Etapa Comitê; sem Data Comitê fica em 2.1 como inconsistente", () => {
  assert.deepEqual(derivarEtapa(pbi21()), { etapa: "2.1", inconsistencia: null });
  const sem = derivarEtapa(pbi21({ dataComite: null }));
  assert.equal(sem.etapa, "2.1");
  assert.match(sem.inconsistencia ?? "", /Data Comitê/);
});

test("derivarEtapa: 3.1 (com a tag) e 3.2 (sem a tag)", () => {
  assert.equal(derivarEtapa(pbi12({ etapa: "Análise", tags: `outra; ${TAG}` })).etapa, "3.1");
  assert.equal(derivarEtapa(pbi12({ etapa: "Analise", tags: "outra" })).etapa, "3.2");
  assert.equal(derivarEtapa(pbi12({ etapa: "Análise", tags: "pronto para refinamento TECH" })).etapa, "3.1");
});

test("derivarEtapa: 4.1 = Orçamento + Relacionamento/Comercial", () => {
  assert.equal(derivarEtapa(pbi12({ status: "Orçamento", etapa: "Relacionamento/Comercial" })).etapa, "4.1");
  assert.equal(derivarEtapa(pbi12({ status: "Orçamento", etapa: "Backlog" })).etapa, null);
});

test("derivarEtapa: fora do quadro", () => {
  assert.equal(derivarEtapa(pbi12({ status: "Execução", etapa: "Execução" })).etapa, null);
  assert.equal(derivarEtapa(pbi12({ etapa: "Aguardando Priorização" })).etapa, null);
  assert.equal(derivarEtapa(pbi12({ status: "Finalizado" })).etapa, null);
});

// ---------------------------------------------------------------- tags

test("tags: adicionar e remover sem duplicar nem perder as outras", () => {
  assert.equal(adicionarTag("", TAG), TAG);
  assert.equal(adicionarTag("a; b", TAG), `a; b; ${TAG}`);
  assert.equal(adicionarTag(`a; ${TAG}`, TAG), `a; ${TAG}`);
  assert.equal(removerTag(`a; ${TAG}; b`, TAG), "a; b");
  assert.equal(removerTag(TAG, TAG), "");
  assert.equal(removerTag("a", TAG), "a");
});

// ---------------------------------------------------------------- 1.1 → 1.2

test("1.1 → 1.2: bloqueia e lista tudo o que falta", () => {
  const r = avaliarMovimento(pbi(), "1.2");
  assert.equal(r.permitido, false);
  assert.equal(r.origem, "1.1");
  assert.equal(r.direcao, "avanco");
  assert.equal(r.proposta, false);
  assert.equal(r.faltas.length, 4);
  assert.deepEqual(r.alteracoes, []);
});

test("1.1 → 1.2: Area ainda KMM5 bloqueia mesmo com o resto preenchido", () => {
  const r = avaliarMovimento(pbi({ cliente: "X", classificacao: "EDI", dataAberturaProduto: "2026-11-01" }), "1.2");
  assert.equal(r.permitido, false);
  assert.match(r.faltas.join(" "), /esteira/);
});

test("1.1 → 1.2: libera com a entrada do usuário e grava só o que mudou", () => {
  const r = avaliarMovimento(pbi({ cliente: "MARONI" }), "1.2", {
    areaPath: "KMM5\\TMS - Dedicada Maroni",
    classificacao: "EDI",
    cliente: "MARONI",
    dataAberturaProduto: "2026-11-01",
  });
  assert.equal(r.permitido, true);
  assert.deepEqual(r.faltas, []);
  assert.deepEqual(
    r.alteracoes.map((a) => a.campo),
    ["System.AreaPath", "Custom.67a95862-58a3-47f7-8f7c-285ec4d13106", "Custom.DataAberturaProduto"],
  );
  assert.equal(r.replicarDataComiteAssesments, false);
});

test("1.1 → 1.2: classificação fora da lista, área fora do KMM5 e data inválida bloqueiam", () => {
  const r = avaliarMovimento(pbi(), "1.2", { areaPath: "KMM4\\TMS - Rangers", classificacao: "Inventada", cliente: "X", dataAberturaProduto: "31/02/2026" });
  assert.equal(r.permitido, false);
  const texto = r.faltas.join(" | ");
  assert.match(texto, /esteira do KMM5/);
  assert.match(texto, /não existe na lista/);
  assert.match(texto, /inválida/);
});

test("1.1 → 1.2: classificação aceita sem diferenciar caixa/acento", () => {
  const r = avaliarMovimento(pbi(), "1.2", { areaPath: "KMM5\\TMS - Melhorias", classificacao: "debito tecnico", cliente: "X", dataAberturaProduto: "2026-11-01" });
  assert.equal(r.permitido, true);
});

// ---------------------------------------------------------------- 1.2 → 2.1

test("1.2 → 2.1: exige Data Comitê", () => {
  const r = avaliarMovimento(pbi12(), "2.1");
  assert.equal(r.permitido, false);
  assert.match(r.faltas[0], /Data Comitê/);
});

test("1.2 → 2.1: grava Etapa Comitê e a data, replica nos Assesments, Status não muda", () => {
  const r = avaliarMovimento(pbi12(), "2.1", { dataComite: "2026-12-10" });
  assert.equal(r.permitido, true);
  assert.equal(r.replicarDataComiteAssesments, true);
  assert.deepEqual(
    r.alteracoes.map((a) => [a.campo, a.para]),
    [
      ["Custom.Etapa", "Comitê"],
      ["Custom.443622e0-6ab8-4ae5-9371-612b44a8fb1d", "2026-12-10"],
    ],
  );
  assert.ok(!r.alteracoes.some((a) => a.campo === "System.State"));
});

test("1.2 → 2.1: Data Comitê já no PBI basta e só a Etapa é gravada", () => {
  const r = avaliarMovimento(pbi12({ dataComite: "2026-12-10T00:00:00Z" }), "2.1");
  assert.equal(r.permitido, true);
  assert.deepEqual(r.alteracoes.map((a) => a.campo), ["Custom.Etapa"]);
  assert.equal(r.replicarDataComiteAssesments, true);
});

// ---------------------------------------------------------------- 2.1 → 3.x

test("2.1 → 3.1: Etapa Análise + tag", () => {
  const r = avaliarMovimento(pbi21({ tags: "a" }), "3.1");
  assert.equal(r.permitido, true);
  assert.deepEqual(r.alteracoes.map((a) => [a.campo, a.para]), [["Custom.Etapa", "Análise"], ["System.Tags", `a; ${TAG}`]]);
});

test("2.1 → 3.2: Etapa Análise sem a tag (remove se existir, não grava se não existe)", () => {
  const com = avaliarMovimento(pbi21({ tags: `a; ${TAG}` }), "3.2");
  assert.deepEqual(com.alteracoes.map((a) => [a.campo, a.para]), [["Custom.Etapa", "Análise"], ["System.Tags", "a"]]);
  const sem = avaliarMovimento(pbi21({ tags: "" }), "3.2");
  assert.deepEqual(sem.alteracoes.map((a) => a.campo), ["Custom.Etapa"]);
});

test("2.1 → 3.x: bloqueia sem Data Comitê", () => {
  assert.equal(avaliarMovimento(pbi21({ dataComite: null }), "3.1").permitido, false);
  assert.equal(avaliarMovimento(pbi21({ dataComite: null }), "3.2").permitido, false);
});

// ---------------------------------------------------------------- voltar (proposta)

test("volta 2.1 → 1.2 (proposta): Etapa vai para Backlog e a Data Comitê é mantida", () => {
  const r = avaliarMovimento(pbi21(), "1.2");
  assert.equal(r.permitido, true);
  assert.equal(r.direcao, "volta");
  assert.equal(r.proposta, true);
  assert.deepEqual(r.alteracoes.map((a) => [a.campo, a.para]), [["Custom.Etapa", "Backlog"]]);
  assert.ok(r.avisos.length > 0);
  assert.equal(r.replicarDataComiteAssesments, false);
});

test("volta 1.2 → 1.1 (proposta): Area Path volta para KMM5", () => {
  const r = avaliarMovimento(pbi12(), "1.1");
  assert.equal(r.permitido, true);
  assert.equal(r.proposta, true);
  assert.deepEqual(r.alteracoes.map((a) => [a.campo, a.para]), [["System.AreaPath", "KMM5"]]);
});

test("movimentos não previstos são bloqueados sem gravar nada", () => {
  for (const [p, destino] of [
    [pbi(), "2.1"], // pula a 1.2
    [pbi(), "1.1"], // mesma etapa
    [pbi12(), "3.1"], // pula a 2.1
    [pbi21(), "1.1"], // volta mais de uma
    [pbi12({ etapa: "Análise", tags: TAG }), "2.1"], // 3.1 não tem regras na Fase 1
    [pbi12({ status: "Execução", etapa: "Execução" }), "1.2"], // fora do quadro
  ] as const) {
    const r = avaliarMovimento(p, destino);
    assert.equal(r.permitido, false);
    assert.deepEqual(r.alteracoes, []);
    assert.ok(r.faltas.length > 0);
  }
});

test("destinosPossiveis", () => {
  assert.deepEqual(destinosPossiveis("1.1"), [{ destino: "1.2", direcao: "avanco" }]);
  assert.deepEqual(destinosPossiveis("1.2"), [{ destino: "2.1", direcao: "avanco" }, { destino: "1.1", direcao: "volta" }]);
  assert.deepEqual(destinosPossiveis("2.1").map((d) => d.destino), ["3.1", "3.2", "1.2"]);
  assert.deepEqual(destinosPossiveis("3.1"), []);
  assert.deepEqual(destinosPossiveis(null), []);
});

// ---------------------------------------------------------------- prontidão e contadores

test("prontidão: pronto, bloqueado e sem movimento", () => {
  assert.equal(prontidaoDoCard(pbi())?.pronto, false);
  assert.equal(prontidaoDoCard(pbi12({ dataComite: "2026-12-10" }))?.pronto, true);
  assert.equal(prontidaoDoCard(pbi21())?.pronto, true);
  assert.equal(prontidaoDoCard(pbi12({ etapa: "Análise" })), null);
  assert.equal(prontidaoDoCard(pbi12({ status: "Execução" })), null);
});

test("contarPorEtapa", () => {
  const c = contarPorEtapa([pbi(), pbi({ id: 2 }), pbi12(), pbi12({ id: 4, dataComite: "2026-12-10" }), pbi21(), pbi12({ etapa: "Análise" }), pbi12({ status: "Execução" })]);
  assert.deepEqual(c["1.1"], { total: 2, prontos: 0, bloqueados: 2 });
  assert.deepEqual(c["1.2"], { total: 2, prontos: 1, bloqueados: 1 });
  assert.deepEqual(c["2.1"], { total: 1, prontos: 1, bloqueados: 0 });
  assert.deepEqual(c["3.2"], { total: 1, prontos: 0, bloqueados: 0 });
});

// ---------------------------------------------------------------- aging e atraso

test("aging: hoje − Data Abertura Produto, com fallback no Created Date", () => {
  const hoje = new Date(2026, 10, 20, 15, 0); // 20/11/2026, horário local
  assert.equal(agingEmDias(pbi({ dataAberturaProduto: "2026-11-10T00:00:00Z" }), hoje), 10);
  assert.equal(agingEmDias(pbi({ dataAberturaProduto: null, criadoEm: "2026-10-21T08:00:00Z" }), hoje), 30);
  assert.equal(agingEmDias(pbi({ dataAberturaProduto: null, criadoEm: null }), hoje), null);
  assert.equal(agingEmDias(pbi({ dataAberturaProduto: "2026-11-25T00:00:00Z" }), hoje), 0);
});

test("aging: vermelho só acima de 30 dias", () => {
  assert.equal(agingEmAlerta(30), false);
  assert.equal(agingEmAlerta(31), true);
  assert.equal(agingEmAlerta(null), false);
});

test("Data Comitê atrasada: antes de hoje", () => {
  const hoje = new Date(2026, 10, 20, 15, 0);
  assert.equal(comiteAtrasado("2026-11-19T00:00:00Z", hoje), true);
  assert.equal(comiteAtrasado("2026-11-20T00:00:00Z", hoje), false);
  assert.equal(comiteAtrasado(null, hoje), false);
});

// ---------------------------------------------------------------- permissões e projeto

test("podeMovimentar: PM, PO, GPM e Product Ops (sem caixa/acento, aceita mais de um papel)", () => {
  for (const ok of ["PM", "pm", " PO ", "Product Owner", "Product Manager", "PM/PO", "CS, GPM", "Tech Lead e PO", "GPM", "Product Ops"]) assert.equal(podeMovimentar(ok), true, ok);
  for (const nao of ["", null, undefined, "CS", "Tech Lead", "QA Leader", "Pomar", "Compo", "Desenvolvedor"]) assert.equal(podeMovimentar(nao), false, String(nao));
});

test("podeMovimentar: usuário tipo adm move mesmo sem papel; tipo user depende do papel", () => {
  assert.equal(podeMovimentar(null, "adm"), true);
  assert.equal(podeMovimentar("CS", "adm"), true);
  assert.equal(podeMovimentar("CS", "user"), false);
  assert.equal(podeMovimentar("PO", "user"), true);
});

test("montarCards: ordena por prioridade, depois mais antigo, depois ID; descarta quem está fora do quadro", () => {
  const cards = montarCards([
    pbi12({ id: 10, prioridade: 2, dataAberturaProduto: "2026-10-01T00:00:00Z" }),
    pbi12({ id: 11, prioridade: 1, dataAberturaProduto: "2026-11-10T00:00:00Z" }),
    pbi12({ id: 12, prioridade: null, dataAberturaProduto: "2026-09-01T00:00:00Z" }),
    pbi12({ id: 13, prioridade: 2, dataAberturaProduto: "2026-10-01T00:00:00Z" }),
    pbi12({ id: 14, prioridade: 2, dataAberturaProduto: "2026-08-01T00:00:00Z" }),
    pbi12({ id: 15, status: "Execução", etapa: "Execução" }),
  ]);
  assert.deepEqual(cards.map((c) => c.pbi.id), [11, 14, 10, 13, 12]);
});

test("montarCards/agruparPorEtapa: coluna, inconsistência e prontidão do card", () => {
  const cards = montarCards([pbi({ id: 1 }), pbi21({ id: 2, dataComite: null }), pbi12({ id: 3, etapa: "Análise", tags: TAG })]);
  const por = agruparPorEtapa(cards);
  assert.deepEqual(por["1.1"].map((c) => c.pbi.id), [1]);
  assert.deepEqual(por["2.1"].map((c) => c.pbi.id), [2]);
  assert.deepEqual(por["3.1"].map((c) => c.pbi.id), [3]);
  assert.deepEqual(por["1.2"], []);
  assert.ok(por["2.1"][0].inconsistencia);
  assert.equal(por["3.1"][0].prontidao, null);
  assert.equal(por["1.1"][0].prontidao?.pronto, false);
});

test("projetoSuportado: só KMM5", () => {
  assert.equal(projetoSuportado("KMM5"), true);
  assert.equal(projetoSuportado("kmm5"), true);
  assert.equal(projetoSuportado("KMM4"), false);
  assert.equal(projetoSuportado(null), false);
});

// ---------------------------------------------------------------- gravação e comentário

test("paraJsonPatch: começa com test /rev, usa add e remove", () => {
  const ops = paraJsonPatch(
    [
      { campo: "Custom.Etapa", rotulo: "Etapa", de: "Backlog", para: "Comitê" },
      { campo: "System.Tags", rotulo: "Tags", de: TAG, para: null },
      { campo: "Custom.X", rotulo: "X", de: null, para: null },
    ],
    9,
  );
  assert.deepEqual(ops, [
    { op: "test", path: "/rev", value: 9 },
    { op: "add", path: "/fields/Custom.Etapa", value: "Comitê" },
    { op: "remove", path: "/fields/System.Tags" },
  ]);
});

test("comentarioDeTransicao: origem, destino, usuário e data (fuso de Brasília); escapa HTML", () => {
  const txt = comentarioDeTransicao({ origem: "1.2", destino: "2.1", usuario: "Ana <script>", quando: new Date("2026-11-20T15:30:00Z") });
  assert.match(txt, /avançou/);
  assert.match(txt, /1\.2 Priorizar e propor solução/);
  assert.match(txt, /2\.1 Comitê/);
  assert.match(txt, /Ana &lt;script&gt;/);
  assert.match(txt, /20\/11\/2026.*12:30/);
  assert.match(comentarioDeTransicao({ origem: "2.1", destino: "1.2", usuario: "x", quando: new Date(), direcao: "volta" }), /voltou/);
});

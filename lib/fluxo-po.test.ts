// Testes das regras puras do Fluxo do PO. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adicionarTag,
  agingEmAlerta,
  agingEmDias,
  avaliarEdicao,
  avaliarMovimento,
  comentarioDeTransicao,
  comiteAtrasado,
  agruparPorEtapa,
  contarPorEtapa,
  derivarEtapa,
  destinosPossiveis,
  paraJsonPatch,
  avisosDaReplicacao,
  chaveDia,
  ehMeuItem,
  idsFilhosDeRelacoes,
  lerEntradaMovimento,
  montarCards,
  nomesCompativeis,
  normalizarDataAzure,
  permissaoDoFluxo,
  podeMovimentar,
  projetoSuportado,
  prontidaoDoCard,
  removerTag,
  replicarDataComite,
  resumirFalta,
  traduzirErroAzure,
  valorLegivelDaAlteracao,
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
    po: "",
    responsavel: "",
    responsavelEmail: "",
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
      ["Custom.443622e0-6ab8-4ae5-9371-612b44a8fb1d", "2026-12-10T03:00:00Z"],
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
  const hoje = new Date("2026-11-20T18:00:00Z"); // 20/11/2026 15:00 em Brasília
  assert.equal(agingEmDias(pbi({ dataAberturaProduto: "2026-11-10T03:00:00Z" }), hoje), 10);
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
  const hoje = new Date("2026-11-20T18:00:00Z");
  assert.equal(comiteAtrasado("2026-11-19T03:00:00Z", hoje), true);
  assert.equal(comiteAtrasado("2026-11-20T03:00:00Z", hoje), false);
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

// ---------------------------------------------------------------- datas no formato do Azure (T05)

test("chaveDia: data pura, instante no fuso de Brasília e inválidos", () => {
  assert.equal(chaveDia("2026-12-10"), "2026-12-10");
  assert.equal(chaveDia("2026-12-10T03:00:00Z"), "2026-12-10"); // meia-noite de Brasília
  assert.equal(chaveDia("2026-12-10T00:00:00Z"), "2026-12-09"); // 21h do dia anterior em Brasília
  assert.equal(chaveDia("2026-06-02T13:36:59.03Z"), "2026-06-02");
  for (const ruim of ["", null, undefined, "10/12/2026", "2026-02-31T03:00:00Z", "lixo"]) assert.equal(chaveDia(ruim), null, String(ruim));
});

test("normalizarDataAzure: data pura vira meia-noite de Brasília; instante é mantido; inválida/vazia vira null", () => {
  assert.equal(normalizarDataAzure("2026-12-10"), "2026-12-10T03:00:00Z");
  assert.equal(normalizarDataAzure(" 2026-12-10 "), "2026-12-10T03:00:00Z");
  assert.equal(normalizarDataAzure("2026-06-02T13:36:59.03Z"), "2026-06-02T13:36:59.03Z");
  for (const ruim of ["", null, undefined, "2026-02-31", "31/12/2026", "lixo"]) assert.equal(normalizarDataAzure(ruim), null, String(ruim));
});

test("movimento grava a Data Comitê normalizada e ignora o mesmo dia já gravado", () => {
  const r = avaliarMovimento(pbi12(), "2.1", { dataComite: "2026-12-10" });
  assert.equal(r.alteracoes.find((a) => a.campo.includes("443622e0"))?.para, "2026-12-10T03:00:00Z");
  // PBI já tem 10/12 (T03:00Z): informar o mesmo dia não gera gravação da data
  const igual = avaliarMovimento(pbi12({ dataComite: "2026-12-10T03:00:00Z" }), "2.1", { dataComite: "2026-12-10" });
  assert.deepEqual(igual.alteracoes.map((a) => a.campo), ["Custom.Etapa"]);
  // outro dia: grava
  const outro = avaliarMovimento(pbi12({ dataComite: "2026-12-10T03:00:00Z" }), "2.1", { dataComite: "2026-12-11" });
  assert.equal(outro.alteracoes.find((a) => a.campo.includes("443622e0"))?.para, "2026-12-11T03:00:00Z");
});

test("1.1 → 1.2 grava a Data Abertura Produto normalizada", () => {
  const r = avaliarMovimento(pbi(), "1.2", { areaPath: "KMM5\\TMS - Melhorias", classificacao: "EDI", cliente: "X", dataAberturaProduto: "2026-11-05" });
  assert.equal(r.permitido, true);
  assert.equal(r.alteracoes.find((a) => a.campo === "Custom.DataAberturaProduto")?.para, "2026-11-05T03:00:00Z");
});

// ---------------------------------------------------------------- erros do Azure em português (T05)

test("traduzirErroAzure: revisão desatualizada (412) vira conflito 409", () => {
  const corpo = JSON.stringify({ typeKey: "TestPatchOperationFailedException", message: "VS403351: Test Operation for path /rev failed, value 13 was not equal to test value 12." });
  const e = traduzirErroAzure(412, corpo);
  assert.equal(e.codigo, "conflito");
  assert.equal(e.status, 409);
  assert.match(e.mensagem, /Atualize o quadro/);
});

test("traduzirErroAzure: regra do Azure vira 422 com mensagem limpa, sem URL", () => {
  const corpo = JSON.stringify({ typeKey: "RuleValidationException", message: "The field 'Etapa' contains the value 'X' that is not in the list. Veja https://dev.azure.com/kmmbynstech/_apis/foo?token=abc" });
  const e = traduzirErroAzure(400, corpo);
  assert.equal(e.codigo, "regra");
  assert.equal(e.status, 422);
  assert.match(e.mensagem, /not in the list/);
  assert.doesNotMatch(e.mensagem, /https?:|token=|dev\.azure/);
});

test("traduzirErroAzure: autenticação, permissão, não encontrado e indisponível", () => {
  assert.equal(traduzirErroAzure(401, "").codigo, "autenticacao");
  assert.equal(traduzirErroAzure(203, "<html>login</html>").codigo, "autenticacao");
  assert.equal(traduzirErroAzure(403, "").codigo, "permissao");
  assert.equal(traduzirErroAzure(404, "{}").status, 404);
  assert.equal(traduzirErroAzure(503, "").codigo, "indisponivel");
  assert.equal(traduzirErroAzure(429, "").codigo, "indisponivel");
  assert.equal(traduzirErroAzure(418, "corpo estranho").codigo, "recusado");
});

test("lerEntradaMovimento: aceita só chaves conhecidas com texto; o resto vira erro", () => {
  assert.deepEqual(lerEntradaMovimento(undefined), { entrada: {} });
  assert.deepEqual(lerEntradaMovimento(null), { entrada: {} });
  assert.deepEqual(lerEntradaMovimento({ cliente: "  MARONI ", dataComite: "2026-12-10" }), { entrada: { cliente: "MARONI", dataComite: "2026-12-10" } });
  assert.ok(lerEntradaMovimento({ etapa: "Comitê" }).erro, "chave desconhecida");
  assert.ok(lerEntradaMovimento({ cliente: 5 }).erro, "valor que não é texto");
  assert.ok(lerEntradaMovimento("texto").erro, "corpo que não é objeto");
  assert.ok(lerEntradaMovimento([1]).erro, "array");
});

// ---------------------------------------------------------------- replicação nos Assesments (T07)

test("idsFilhosDeRelacoes: só Hierarchy-Forward (filhos); ignora o sentido inverso, relacionados e anexos", () => {
  const base = "https://dev.azure.com/org/00000000-0000-0000-0000-000000000000/_apis/wit/workItems/";
  assert.deepEqual(
    idsFilhosDeRelacoes([
      { rel: "System.LinkTypes.Hierarchy-Forward", url: `${base}47004` },
      { rel: "System.LinkTypes.Hierarchy-Forward", url: `${base}21084` },
      { rel: "System.LinkTypes.Hierarchy-Reverse", url: `${base}24008` }, // pai (caso invertido): ignorado
      { rel: "System.LinkTypes.Related", url: `${base}999` },
      { rel: "AttachedFile", url: "https://dev.azure.com/org/_apis/wit/attachments/abc" },
      { rel: "System.LinkTypes.Hierarchy-Forward", url: `${base}47004` }, // duplicada
    ]),
    [47004, 21084],
  );
  assert.deepEqual(idsFilhosDeRelacoes(undefined), []);
  assert.deepEqual(idsFilhosDeRelacoes([]), []);
});

test("replicarDataComite: grava em TODOS os filhos que diferem e pula os que já têm o mesmo dia", async () => {
  const gravados: [number, string][] = [];
  const r = await replicarDataComite({
    filhos: [
      { id: 3, dataComite: null },
      { id: 1, dataComite: "2026-12-10T03:00:00Z" }, // já igual
      { id: 2, dataComite: "2026-11-01T03:00:00Z" },
    ],
    dataComite: "2026-12-10T03:00:00Z",
    gravar: async (id, data) => void gravados.push([id, data]),
  });
  assert.deepEqual(r, { total: 3, atualizados: [2, 3], jaIguais: [1], falhas: [] });
  assert.deepEqual(gravados.sort((a, b) => a[0] - b[0]), [[2, "2026-12-10T03:00:00Z"], [3, "2026-12-10T03:00:00Z"]]);
  assert.deepEqual(avisosDaReplicacao(r), []);
});

test("replicarDataComite: falha parcial não impede os outros e é listada", async () => {
  const r = await replicarDataComite({
    filhos: [{ id: 1, dataComite: null }, { id: 2, dataComite: null }, { id: 3, dataComite: null }],
    dataComite: "2026-12-10T03:00:00Z",
    gravar: async (id) => {
      if (id === 2) throw new Error("Item fechado");
    },
  });
  assert.deepEqual(r.atualizados, [1, 3]);
  assert.deepEqual(r.falhas, [{ id: 2, erro: "Item fechado" }]);
  const [aviso] = avisosDaReplicacao(r);
  assert.match(aviso, /1 de 3/);
  assert.match(aviso, /#2 \(Item fechado\)/);
});

test("replicarDataComite: sem filho avisa e segue", async () => {
  const r = await replicarDataComite({ filhos: [], dataComite: "2026-12-10T03:00:00Z", gravar: async () => {} });
  assert.deepEqual(r, { total: 0, atualizados: [], jaIguais: [], falhas: [] });
  assert.deepEqual(avisosDaReplicacao(r), ["PBI sem Assesment filho: a Data Comitê não foi replicada."]);
});

// ---------------------------------------------------------------- "Meus itens" (T13)

test("nomesCompativeis: igualdade sem caixa/acento ou nome mais curto contido no mais longo (mín. 2 palavras)", () => {
  assert.equal(nomesCompativeis("Heder Martins", "Heder Luiz Martins Junior"), true);
  assert.equal(nomesCompativeis("heder luiz martins junior", "HEDER LUIZ MARTINS JUNIOR"), true);
  assert.equal(nomesCompativeis("João Silva", "Joao da Silva"), true);
  assert.equal(nomesCompativeis("Ana", "Ana Paula Souza"), false); // uma palavra só não basta
  assert.equal(nomesCompativeis("Ana", "Ana"), true);
  assert.equal(nomesCompativeis("Heder Martins", "Carlos Martins"), false);
  assert.equal(nomesCompativeis("", "Ana Souza"), false);
  assert.equal(nomesCompativeis(null, null), false);
});

test("ehMeuItem: responsável por e-mail ou nome, PO por nome; sem identificação nada é meu", () => {
  const eu = { email: "heder.martins@nstech.com.br", nome: "Heder Martins" };
  assert.equal(ehMeuItem({ po: "", responsavel: "", responsavelEmail: "Heder.Martins@nstech.com.br" }, eu), true);
  assert.equal(ehMeuItem({ po: "Heder Luiz Martins Junior", responsavel: "", responsavelEmail: "" }, eu), true);
  assert.equal(ehMeuItem({ po: "", responsavel: "Heder Luiz Martins Junior", responsavelEmail: "outro@x.com" }, eu), true);
  assert.equal(ehMeuItem({ po: "Carlos Souza", responsavel: "Ana Lima", responsavelEmail: "ana@x.com" }, eu), false);
  assert.equal(ehMeuItem({ po: "", responsavel: "", responsavelEmail: "" }, eu), false);
  assert.equal(ehMeuItem({ po: "Heder Martins", responsavel: "", responsavelEmail: "" }, { email: null, nome: null }), false);
  assert.equal(ehMeuItem({ po: "Heder Martins", responsavel: "", responsavelEmail: "" }, { email: null, nome: "Heder Martins" }), true);
});

// ---------------------------------------------------------------- prontidão no card (T14)

test("resumirFalta: texto curto para o card", () => {
  assert.equal(resumirFalta("Preencher a Data Comitê."), "Data Comitê");
  assert.equal(resumirFalta("Preencher a Classificação."), "Classificação");
  assert.equal(resumirFalta("Preencher o Cliente."), "Cliente");
  assert.equal(resumirFalta("Preencher a Data Abertura Produto."), "Data Abertura Produto");
  assert.equal(resumirFalta("Definir a esteira: o Area Path ainda é a raiz KMM5."), "Esteira (Area Path)");
  assert.equal(resumirFalta("Definir a esteira (Area Path)."), "Esteira (Area Path)");
  assert.equal(resumirFalta("O Area Path precisa ser uma esteira do KMM5."), "Area Path fora do KMM5");
  assert.equal(resumirFalta('Classificação "X" não existe na lista do Azure.'), "Classificação fora da lista");
  assert.equal(resumirFalta("Data Comitê inválida."), "Data Comitê inválida");
  assert.equal(resumirFalta("O Status precisa continuar Backlog."), "O Status precisa continuar Backlog");
});

test("prontidão de um card 1.1 sem nada preenchido lista as 4 faltas resumidas", () => {
  const p = prontidaoDoCard(pbi());
  assert.equal(p?.pronto, false);
  assert.deepEqual(p?.faltas.map(resumirFalta), ["Esteira (Area Path)", "Classificação", "Cliente", "Data Abertura Produto"]);
});

// ---------------------------------------------------------------- permissão com motivo (T11)

test("permissaoDoFluxo: libera PM/PO/GPM/Product Ops e adm; nega com motivo claro aos demais", () => {
  for (const [papel, tipo] of [["PM", "user"], ["po", "user"], ["GPM", "user"], ["Product Ops", "user"], [null, "adm"], ["CS", "adm"]] as const) {
    assert.deepEqual(permissaoDoFluxo(papel, tipo), { pode: true, motivo: null }, `${papel}/${tipo}`);
  }
  const cs = permissaoDoFluxo("CS", "user");
  assert.equal(cs.pode, false);
  assert.match(cs.motivo ?? "", /Seu papel no cadastro de acesso é "CS"/);
  assert.match(cs.motivo ?? "", /PM, PO, GPM, Product Ops e administradores/);
  const semPapel = permissaoDoFluxo(null, "user");
  assert.equal(semPapel.pode, false);
  assert.match(semPapel.motivo ?? "", /não tem papel/);
  assert.equal(permissaoDoFluxo("", undefined).pode, false);
});

test("permissão: o resultado concorda com podeMovimentar em todos os casos", () => {
  for (const papel of ["PM", "PO e CS", "Tech Lead", "", null, "product ops", "Compo"]) {
    for (const tipo of ["user", "adm", undefined]) assert.equal(permissaoDoFluxo(papel, tipo).pode, podeMovimentar(papel, tipo));
  }
});

// ---------------------------------------------------------------- edição das informações (T16)

test("avaliarEdicao: grava só o que mudou; datas normalizadas; vazio limpa o campo", () => {
  const base = pbi12({ cliente: "MARONI", classificacao: "EDI", dataAberturaProduto: "2026-11-01T13:00:00.000Z", dataComite: "2026-12-10T03:00:00Z" });
  const r = avaliarEdicao(base, { cliente: "MARONI", classificacao: "Débito Técnico", dataAberturaProduto: "2026-11-01", dataComite: "2026-12-20" });
  assert.equal(r.permitido, true);
  assert.deepEqual(r.alteracoes.map((a) => [a.campo, a.de, a.para]), [
    ["Custom.67a95862-58a3-47f7-8f7c-285ec4d13106", "EDI", "Débito Técnico"],
    ["Custom.443622e0-6ab8-4ae5-9371-612b44a8fb1d", "2026-12-10T03:00:00Z", "2026-12-20T03:00:00Z"],
  ]);
  assert.equal(r.replicarDataComiteAssesments, true);
  const limpa = avaliarEdicao(base, { classificacao: "", cliente: "" });
  assert.deepEqual(limpa.alteracoes.map((a) => a.para), [null, null]);
});

test("avaliarEdicao: nada informado ou igual ao atual não gera alteração", () => {
  assert.deepEqual(avaliarEdicao(pbi12(), {}).alteracoes, []);
  const r = avaliarEdicao(pbi12(), { cliente: "MARONI", classificacao: "EDI", areaPath: "KMM5\\TMS - Dedicada Maroni" });
  assert.equal(r.permitido, true);
  assert.deepEqual(r.alteracoes, []);
  assert.equal(r.replicarDataComiteAssesments, false);
});

test("avaliarEdicao: valores inválidos bloqueiam tudo (Area Path vazio/fora do KMM5, datas inexistentes)", () => {
  for (const entrada of [{ areaPath: "" }, { areaPath: "KMM4\\TMS - Rangers" }, { dataComite: "2026-02-31" }, { dataAberturaProduto: "31/12/2026" }]) {
    const r = avaliarEdicao(pbi12(), { cliente: "OUTRO", ...entrada });
    assert.equal(r.permitido, false, JSON.stringify(entrada));
    assert.ok(r.faltas.length > 0);
    assert.deepEqual(r.alteracoes, [], "inválido não grava nem o que estava certo");
    assert.equal(r.replicarDataComiteAssesments, false);
  }
});

test("avaliarEdicao: Area Path que troca o card de coluna avisa; Data Comitê limpa avisa e não replica", () => {
  const trocaEsteira = avaliarEdicao(pbi(), { areaPath: "KMM5\\TMS - Melhorias" });
  assert.equal(trocaEsteira.permitido, true);
  assert.match(trocaEsteira.avisos.join(" "), /passa a aparecer em 1\.2/);
  const voltaRaiz = avaliarEdicao(pbi12(), { areaPath: "KMM5" });
  assert.match(voltaRaiz.avisos.join(" "), /passa a aparecer em 1\.1/);
  const mesmaColuna = avaliarEdicao(pbi12(), { areaPath: "KMM5\\TMS - Melhorias" });
  assert.deepEqual(mesmaColuna.avisos, []);

  const limpa = avaliarEdicao(pbi21(), { dataComite: "" });
  assert.equal(limpa.replicarDataComiteAssesments, false);
  assert.match(limpa.avisos.join(" "), /Assesments filhos mantêm/);
  assert.match(limpa.avisos.join(" "), /inconsistente/);
  assert.deepEqual(limpa.alteracoes.map((a) => a.para), [null]);
});

test("valorLegivelDaAlteracao: datas em dd/mm/aaaa (Brasília), vazio, Area Path sem prefixo e demais valores intactos", () => {
  const dataComite = "Custom.443622e0-6ab8-4ae5-9371-612b44a8fb1d";
  assert.equal(valorLegivelDaAlteracao(dataComite, "2031-12-31T03:00:00Z"), "31/12/2031");
  assert.equal(valorLegivelDaAlteracao("Custom.DataAberturaProduto", "2026-10-02T20:21:07.053Z"), "02/10/2026");
  assert.equal(valorLegivelDaAlteracao(dataComite, null), "vazio");
  assert.equal(valorLegivelDaAlteracao("Custom.Cliente", ""), "vazio");
  assert.equal(valorLegivelDaAlteracao("System.AreaPath", "KMM5\\TMS - Melhorias"), "TMS - Melhorias");
  assert.equal(valorLegivelDaAlteracao("System.AreaPath", "KMM5"), "KMM5 (sem esteira)");
  assert.equal(valorLegivelDaAlteracao("Custom.Etapa", "Comitê"), "Comitê");
  assert.equal(valorLegivelDaAlteracao(dataComite, "lixo"), "lixo");
});

// Testes das regras puras do Fluxo do PO. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import { urlPbiAzure } from "./fluxo-po-campos";
import {
  AO_AVANCAR,
  MOTIVOS_CANCELAMENTO,
  LIMITE_COMENTARIO,
  QUANDO_AVANCA,
  adicionarTag,
  agingEmAlerta,
  agingEmDias,
  avaliarCancelamento,
  avaliarEdicao,
  avaliarMovimento,
  camposParaMover,
  comentarioDeCancelamento,
  comentarioDeTransicao,
  comentarioDoUsuario,
  comiteAtrasado,
  agruparPorEtapa,
  contarPorEtapa,
  derivarEtapa,
  detectarConflitoDeEdicao,
  destinosPossiveis,
  paraJsonPatch,
  avisosDaReplicacao,
  chaveDia,
  ehMeuItem,
  idsFilhosDeRelacoes,
  lerEntradaMovimento,
  motivoDeCancelamento,
  montarCards,
  ordenarCardsDoComite,
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
  validarComentario,
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
  assert.match(txt, /1\.2 Priorizar - Backlog da Esteira/);
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

// ---------------------------------------------------------------- detalhe: textos e comentário do usuário (T17)

test("QUANDO_AVANCA e AO_AVANCAR: textos para as 3 etapas com movimento, de acordo com as regras", () => {
  assert.deepEqual(Object.keys(QUANDO_AVANCA), ["1.1", "1.2", "2.1"]);
  assert.match(QUANDO_AVANCA["1.1"], /esteira definida/);
  assert.match(QUANDO_AVANCA["2.1"], /Comitê de Produto/);
  // os destinos descritos são exatamente os avanços que o módulo de regras permite
  for (const etapa of ["1.1", "1.2", "2.1"] as const) {
    const avancos = destinosPossiveis(etapa).filter((d) => d.direcao === "avanco").map((d) => d.destino);
    assert.deepEqual(AO_AVANCAR[etapa].map((a) => a.destino), avancos, etapa);
    for (const a of AO_AVANCAR[etapa]) assert.ok(a.grava.length >= 2);
  }
  assert.match(AO_AVANCAR["2.1"][0].grava.join(" "), /Pronto para refinamento tech/);
  assert.doesNotMatch(AO_AVANCAR["2.1"][1].grava.join(" "), /Pronto para refinamento tech/);
});

test("validarComentario: só texto, sem vazio, dentro do limite; normaliza quebras de linha", () => {
  assert.deepEqual(validarComentario("  Olá\r\nmundo  "), { texto: "Olá\nmundo" });
  for (const ruim of ["", "   ", "\n\n", null, undefined, 5, {}]) assert.ok(validarComentario(ruim).erro, String(ruim));
  assert.equal(validarComentario("a".repeat(LIMITE_COMENTARIO)).erro, undefined);
  assert.match(validarComentario("a".repeat(LIMITE_COMENTARIO + 1)).erro ?? "", /limite de 4000/);
});

test("comentarioDoUsuario: nome, data (Brasília) e 'via Produto Hub'; texto escapado; quebras viram <br>", () => {
  const html = comentarioDoUsuario({ texto: "Linha 1\n<script>alert(1)</script> & fim", usuario: "Ana <b>", quando: new Date("2026-11-20T15:30:00Z") });
  assert.match(html, /<b>Ana &lt;b&gt;<\/b>/);
  assert.match(html, /20\/11\/2026.*12:30/);
  assert.match(html, /via Produto Hub/);
  assert.match(html, /Linha 1<br>&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; fim/);
  assert.doesNotMatch(html, /<script/);
});

// ---------------------------------------------------------------- conflito de edição (T19)

test("detectarConflitoDeEdicao: só os campos EDITADOS cujo valor no Azure já não é o que o usuário viu", () => {
  const agora = pbi12({ cliente: "NOVO CLIENTE", classificacao: "EDI", dataComite: "2026-12-20T03:00:00Z" });
  // viu "MARONI"; outra pessoa trocou para "NOVO CLIENTE" e ele também está editando o Cliente → conflito
  const c = detectarConflitoDeEdicao(agora, { cliente: "OUTRO" }, { cliente: "MARONI" });
  assert.equal(c.length, 1);
  assert.equal(c[0].rotulo, "Cliente");
  assert.equal(c[0].visto, "MARONI");
  assert.equal(c[0].atual, "NOVO CLIENTE");
  // a Data Comitê também mudou, mas ele NÃO a edita → sem conflito
  assert.deepEqual(detectarConflitoDeEdicao(agora, { classificacao: "Débito Técnico" }, { classificacao: "EDI", dataComite: "2026-12-10" }), []);
});

test("detectarConflitoDeEdicao: datas pelo dia (formato do Azure não conta), vazio = vazio, sem base não há checagem", () => {
  const agora = pbi12({ dataComite: "2026-12-10T03:00:00Z", dataAberturaProduto: null });
  assert.deepEqual(detectarConflitoDeEdicao(agora, { dataComite: "2026-12-11" }, { dataComite: "2026-12-10" }), []); // mesmo dia
  const outroDia = detectarConflitoDeEdicao(agora, { dataComite: "2026-12-11" }, { dataComite: "2026-12-05" });
  assert.equal(outroDia.length, 1);
  assert.equal(outroDia[0].visto, "05/12/2026");
  assert.equal(outroDia[0].atual, "10/12/2026");
  assert.deepEqual(detectarConflitoDeEdicao(agora, { dataAberturaProduto: "2026-11-01" }, { dataAberturaProduto: "" }), []); // vazio = vazio
  const virouVazio = detectarConflitoDeEdicao(pbi12({ dataComite: null }), { dataComite: "2026-12-11" }, { dataComite: "2026-12-10" });
  assert.equal(virouVazio[0].atual, "vazio");
  assert.deepEqual(detectarConflitoDeEdicao(agora, { cliente: "X" }, undefined), []);
  assert.deepEqual(detectarConflitoDeEdicao(agora, { cliente: "X" }, {}), []);
});

test("detectarConflitoDeEdicao: várias divergências são todas listadas", () => {
  const agora = pbi12({ cliente: "A", classificacao: "EDI", areaPath: "KMM5\\TMS - Melhorias" });
  const c = detectarConflitoDeEdicao(agora, { cliente: "B", classificacao: "Fast Track", areaPath: "KMM5" }, { cliente: "Z", classificacao: "EDI", areaPath: "KMM5\\TMS - SWAT" });
  assert.deepEqual(c.map((x) => x.rotulo).sort(), ["Area Path", "Cliente"]);
  assert.equal(c.find((x) => x.rotulo === "Area Path")!.atual, "TMS - Melhorias");
});

// ---------------------------------------------------------------- bordas das regras (T20)

test("1.1 → 1.2: Area Path vazio informado na tela é falta; 1.2 → 2.1: Data Comitê inexistente é falta", () => {
  const semArea = avaliarMovimento(pbi(), "1.2", { areaPath: "", classificacao: "EDI", cliente: "X", dataAberturaProduto: "2026-11-01" });
  assert.equal(semArea.permitido, false);
  assert.deepEqual(semArea.faltas, ["Definir a esteira (Area Path)."]);
  const dataRuim = avaliarMovimento(pbi12(), "2.1", { dataComite: "2026-02-31" });
  assert.equal(dataRuim.permitido, false);
  assert.deepEqual(dataRuim.faltas, ["Data Comitê inválida."]);
  assert.deepEqual(dataRuim.alteracoes, []);
});

test("avaliarEdicao: limpar a Data Abertura Produto grava vazio; data de abertura inválida bloqueia", () => {
  const base = pbi12({ dataAberturaProduto: "2026-11-01T13:00:00.000Z" });
  const limpa = avaliarEdicao(base, { dataAberturaProduto: "" });
  assert.equal(limpa.permitido, true);
  assert.deepEqual(limpa.alteracoes.map((a) => a.para), [null]);
  const ruim = avaliarEdicao(base, { dataAberturaProduto: "31/12/2026" });
  assert.equal(ruim.permitido, false);
  assert.deepEqual(ruim.faltas, ["Data Abertura Produto inválida."]);
});

test("lerEntradaMovimento ignora chaves undefined; relações sem URL e falha que não é Error não quebram", async () => {
  assert.deepEqual(lerEntradaMovimento({ cliente: undefined, dataComite: "2026-12-10" }), { entrada: { dataComite: "2026-12-10" } });
  assert.deepEqual(idsFilhosDeRelacoes([{ rel: "System.LinkTypes.Hierarchy-Forward" }, { rel: "System.LinkTypes.Hierarchy-Forward", url: "sem-id" }]), []);
  const r = await replicarDataComite({
    filhos: [{ id: 1, dataComite: null }],
    dataComite: "2026-12-10T03:00:00Z",
    gravar: async () => {
      throw "texto solto"; // eslint-disable-line no-throw-literal
    },
  });
  assert.deepEqual(r.falhas, [{ id: 1, erro: "texto solto" }]);
});

test("traduzirErroAzure: 400 sem mensagem, corpo que não é JSON e status desconhecido", () => {
  assert.equal(traduzirErroAzure(400, JSON.stringify({ typeKey: "RuleValidationException" })).mensagem, "O Azure DevOps recusou a gravação.");
  const naoJson = traduzirErroAzure(400, "<html>erro</html>");
  assert.equal(naoJson.codigo, "regra");
  assert.equal(naoJson.mensagem, "O Azure DevOps recusou a gravação.");
  assert.equal(traduzirErroAzure(418, "{}").mensagem, "O Azure DevOps recusou a operação (HTTP 418).");
});

test("nomes em ordem inversa de tamanho, PO igual ao e-mail e link do PBI no Azure", () => {
  assert.equal(nomesCompativeis("Heder Luiz Martins Junior", "Heder Martins"), true);
  assert.equal(ehMeuItem({ po: "Heder.Martins@nstech.com.br", responsavel: "", responsavelEmail: "" }, { email: "heder.martins@nstech.com.br", nome: null }), true);
  assert.equal(urlPbiAzure(46766), "https://dev.azure.com/kmmbynstech/KMM5/_workitems/edit/46766");
});

test("montarCards: sem Data Abertura nem Created Date vai para o fim da prioridade e desempata por ID", () => {
  const cards = montarCards([pbi12({ id: 30, dataAberturaProduto: null, criadoEm: null }), pbi12({ id: 20, dataAberturaProduto: null, criadoEm: null }), pbi12({ id: 10, dataAberturaProduto: "2026-11-01T13:00:00Z" })]);
  assert.deepEqual(cards.map((c) => c.pbi.id), [10, 20, 30]);
});

// ---------------------------------------------------------------- Cliente em qualquer movimento e campos a preencher (2026-11-22)

test("sem Cliente nenhum movimento passa: avanços e voltas, em todas as etapas", () => {
  const casos: [PbiFluxo, "1.1" | "1.2" | "2.1" | "3.1" | "3.2"][] = [
    [pbi12({ cliente: "", dataComite: "2026-12-10T03:00:00Z" }), "2.1"], // 1.2 → 2.1
    [pbi21({ cliente: "" }), "3.1"], // 2.1 → 3.1
    [pbi21({ cliente: "" }), "3.2"], // 2.1 → 3.2
    [pbi21({ cliente: "" }), "1.2"], // volta 2.1 → 1.2
    [pbi12({ cliente: "" }), "1.1"], // volta 1.2 → 1.1
  ];
  for (const [p, destino] of casos) {
    const r = avaliarMovimento(p, destino);
    assert.equal(r.permitido, false, `${r.origem} → ${destino}`);
    assert.ok(r.faltas.includes("Preencher o Cliente."), `${r.origem} → ${destino}: ${r.faltas.join(" | ")}`);
    assert.deepEqual(r.alteracoes, []);
  }
  // 1.1 → 1.2: continua exigindo o Cliente, na mesma posição de antes (depois da Classificação)
  assert.deepEqual(avaliarMovimento(pbi(), "1.2").faltas.map(resumirFalta), ["Esteira (Area Path)", "Classificação", "Cliente", "Data Abertura Produto"]);
});

test("Cliente informado na confirmação libera o movimento e é gravado junto (em qualquer etapa)", () => {
  const r = avaliarMovimento(pbi12({ cliente: "", dataComite: "2026-12-10T03:00:00Z" }), "2.1", { cliente: "MARONI" });
  assert.equal(r.permitido, true);
  assert.deepEqual(r.alteracoes.map((a) => [a.campo, a.para]), [["Custom.Cliente", "MARONI"], ["Custom.Etapa", "Comitê"]]);
  const volta = avaliarMovimento(pbi21({ cliente: "" }), "1.2", { cliente: "MARONI" });
  assert.equal(volta.permitido, true);
  assert.deepEqual(volta.alteracoes.map((a) => a.campo), ["Custom.Cliente", "Custom.Etapa"]);
  const analise = avaliarMovimento(pbi21({ cliente: "", dataComite: null }), "3.1", { cliente: "MARONI", dataComite: "2026-12-10" });
  assert.equal(analise.permitido, true);
  assert.deepEqual(analise.alteracoes.map((a) => a.campo), ["Custom.Cliente", "Custom.443622e0-6ab8-4ae5-9371-612b44a8fb1d", "Custom.Etapa", "System.Tags"]);
});

test("listas do Azure: Classificação e Cliente informados são conferidos pela lista recebida (não pela fixa do código)", () => {
  const entrada = { areaPath: "KMM5\\TMS - Melhorias", classificacao: "Classe Nova do Azure", cliente: "CLIENTE NOVO", dataAberturaProduto: "2026-11-01" };
  // sem as listas: a Classificação fora da lista fixa do código é recusada
  assert.ok(avaliarMovimento(pbi(), "1.2", entrada).faltas.some((f) => f.includes("não existe na lista")));
  // com as listas do Azure (que já têm o valor novo): passa
  const r = avaliarMovimento(pbi(), "1.2", entrada, { classificacoes: ["EDI", "Classe Nova do Azure"], clientes: ["MARONI", "CLIENTE NOVO"] });
  assert.equal(r.permitido, true, r.faltas.join(" | "));
  // Cliente fora da lista do Azure é recusado, mas um Cliente que JÁ está no PBI (legado) não é reconferido
  const fora = avaliarMovimento(pbi(), "1.2", { ...entrada, cliente: "INVENTADO" }, { classificacoes: ["Classe Nova do Azure"], clientes: ["MARONI"] });
  assert.deepEqual(fora.faltas, ['Cliente "INVENTADO" não existe na lista do Azure.']);
  const legado = avaliarMovimento(pbi12({ cliente: "CLIENTE ANTIGO FORA DA LISTA", dataComite: "2026-12-10T03:00:00Z" }), "2.1", {}, { clientes: ["MARONI"] });
  assert.equal(legado.permitido, true);
});

test("camposParaMover: o que a confirmação pede para cada movimento, na ordem da tela", () => {
  assert.deepEqual(camposParaMover(pbi(), "1.2"), ["areaPath", "classificacao", "cliente", "dataAberturaProduto"]);
  assert.deepEqual(camposParaMover(pbi({ cliente: "X", classificacao: "EDI", dataAberturaProduto: "2026-11-01T13:00:00Z" }), "1.2"), ["areaPath"]);
  assert.deepEqual(camposParaMover(pbi12(), "2.1"), ["dataComite"]);
  assert.deepEqual(camposParaMover(pbi12({ cliente: "" }), "2.1"), ["cliente", "dataComite"]);
  assert.deepEqual(camposParaMover(pbi12({ dataComite: "2026-12-10T03:00:00Z" }), "2.1"), []);
  assert.deepEqual(camposParaMover(pbi21({ cliente: "" }), "3.1"), ["cliente"]);
  assert.deepEqual(camposParaMover(pbi21({ cliente: "", dataComite: null }), "3.2"), ["cliente", "dataComite"]);
  assert.deepEqual(camposParaMover(pbi21({ cliente: "" }), "1.2"), ["cliente"]); // volta: só o Cliente
  assert.deepEqual(camposParaMover(pbi12(), "1.1"), []); // volta com Cliente: nada a preencher
  assert.deepEqual(camposParaMover(pbi(), "2.1"), []); // movimento que não existe
  assert.deepEqual(camposParaMover(pbi12({ status: "Execução", etapa: "Execução" }), "2.1"), []); // fora do quadro
});

// ---------------------------------------------------------------- cancelamento de demanda (2026-11-22)

test("MOTIVOS_CANCELAMENTO: os 7 motivos, com o texto padrão de cada um, dentro do limite de comentário", () => {
  assert.deepEqual(MOTIVOS_CANCELAMENTO.map((m) => m.rotulo), ["Demanda fora de priorização do produto", "Torre de Controle", "ERP", "TNS", "Obrigação Legal", "Excesso de demandas", "Usuário não liberado para abertura de demanda"]);
  assert.equal(new Set(MOTIVOS_CANCELAMENTO.map((m) => m.id)).size, 7);
  for (const m of MOTIVOS_CANCELAMENTO) {
    assert.ok(m.texto.length > 40 && m.texto.length <= LIMITE_COMENTARIO, m.id);
    assert.equal(validarComentario(m.texto).erro, undefined, m.id);
    assert.doesNotMatch(m.texto, /PÚBLICO|PUBLICO/, `${m.id}: a marca fica no título do comentário, não no texto`);
    assert.doesNotMatch(m.texto, /\bÁ partir\b|\bá partir\b|esta sendo|TMS\.Devido|;$/, `${m.id}: ortografia`);
  }
  const fora = MOTIVOS_CANCELAMENTO[0].texto.split("\n");
  assert.equal(fora.length, 5);
  assert.equal(fora.filter((l) => l.startsWith("* ")).length, 3); // as 3 justificativas
  assert.match(fora[0], /^Após análise técnica e alinhamento com a estratégia de produto/);
  assert.match(MOTIVOS_CANCELAMENTO[1].texto, /nova torre de controle/);
  assert.match(MOTIVOS_CANCELAMENTO[2].texto, /road map de construção a partir de 2027/);
  assert.match(MOTIVOS_CANCELAMENTO[3].texto, /ecossistema NS Tech/);
  assert.match(MOTIVOS_CANCELAMENTO[4].texto, /^Esta demanda já faz parte de escopo de evolução obrigatório de TMS\./);
  assert.match(MOTIVOS_CANCELAMENTO[5].texto, /^Devido à quantidade de demandas em aberto.*esta demanda está sendo cancelada e deve ser reaberta.*Key User e time de produtos\.$/);
  assert.match(MOTIVOS_CANCELAMENTO[6].texto, /^Conforme alinhamento feito entre as equipes, esta demanda está sendo cancelada por não ter sido aberta pelo Key User da empresa\..*alinhamento prévio\.$/);
});

test("motivoDeCancelamento: acha pelo id, recusa o resto", () => {
  assert.equal(motivoDeCancelamento("erp")?.rotulo, "ERP");
  for (const ruim of ["", "ERP", "outro", null, undefined, 5]) assert.equal(motivoDeCancelamento(ruim), undefined, String(ruim));
});

test("avaliarCancelamento: só nas etapas 1.1 e 1.2 (mesmo sem Cliente); da 2.1 em diante ou fora do quadro é recusado com o motivo", () => {
  assert.deepEqual(avaliarCancelamento(pbi()), { permitido: true, faltas: [] });
  assert.equal(avaliarCancelamento(pbi({ cliente: "" })).permitido, true); // cancelar não é movimentação: não exige Cliente
  assert.deepEqual(avaliarCancelamento(pbi12()), { permitido: true, faltas: [] }); // 1.2: liberado em 2026-11-23
  assert.equal(avaliarCancelamento(pbi12({ cliente: "" })).permitido, true);
  const na21 = avaliarCancelamento(pbi21());
  assert.equal(na21.permitido, false);
  assert.match(na21.faltas[0], /só pode ser cancelada nas etapas 1\.1 \(Classificar\) e 1\.2 \(Priorizar - Backlog da Esteira\).*2\.1 Comitê/);
  assert.equal(avaliarCancelamento(pbi12({ etapa: "Análise" })).permitido, false);
  assert.deepEqual(avaliarCancelamento(pbi12({ status: "Execução", etapa: "Execução" })), { permitido: false, faltas: ["O PBI não está em nenhuma etapa do fluxo."] });
});

test("comentarioDeCancelamento: assinatura, motivo e texto escapado com quebras de linha", () => {
  const html = comentarioDeCancelamento({ texto: "Linha 1\n<b>x</b> & fim", usuario: "Ana <i>", quando: new Date("2026-11-22T15:30:00Z"), motivo: "Torre de Controle" });
  assert.match(html, /<b>Ana &lt;i&gt;<\/b> · 22\/11\/2026.*12:30 <i>\(via Produto Hub\)<\/i> — <b>\[PÚBLICO\] Cancelamento de demanda<\/b>: Torre de Controle/);
  assert.match(html, /Linha 1<br>&lt;b&gt;x&lt;\/b&gt; &amp; fim/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test("ordenarCardsDoComite: sem data no topo, depois da Data Comitê mais antiga para a mais nova; empate pela ordem do quadro", () => {
  const cards = montarCards([
    pbi21({ id: 5, dataComite: "2026-12-20T03:00:00Z" }),
    pbi21({ id: 4, dataComite: "2026-12-01T03:00:00Z" }),
    pbi21({ id: 3, dataComite: null }),
    pbi21({ id: 2, dataComite: "2026-12-20T03:00:00Z" }),
    pbi21({ id: 1, dataComite: null }),
    pbi21({ id: 6, dataComite: "2027-01-05T03:00:00Z" }),
  ]);
  const antes = cards.map((c) => c.pbi.id);
  const ordem = ordenarCardsDoComite(cards).map((c) => c.pbi.id);
  assert.deepEqual(ordem, [1, 3, 4, 2, 5, 6]);
  assert.deepEqual(cards.map((c) => c.pbi.id), antes); // não altera a lista recebida
});

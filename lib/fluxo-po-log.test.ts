// Testes da montagem do log de movimentos e das definições de checklist. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import { linhaDeEdicao, linhaDeFalha, linhaDeSucesso, resultadoDoErro, type ContextoLog } from "./fluxo-po-log";
import { CHECKLIST_POR_ETAPA, ETAPAS_FLUXO, itemDeChecklistValido } from "./fluxo-po";

const ctx: ContextoLog & { workItemId: number } = {
  workItemId: 46766,
  origem: "1.2",
  destino: "2.1",
  direcao: "avanco",
  proposta: false,
  usuario: "ana@nstech.com.br",
  usuarioNome: "Ana",
  revisaoAntes: 13,
  alteracoes: null,
};

const alteracoes = [{ campo: "Custom.Etapa", rotulo: "Etapa", de: "Backlog", para: "Comitê" }];

test("resultadoDoErro: códigos do servidor → resultado do log", () => {
  assert.equal(resultadoDoErro("sem_permissao"), "sem_permissao");
  assert.equal(resultadoDoErro("conflito"), "conflito");
  for (const c of ["regra", "entrada_invalida", "fora_do_escopo"]) assert.equal(resultadoDoErro(c), "bloqueado", c);
  for (const c of ["autenticacao", "permissao", "indisponivel", "sem_revisao", "erro", "qualquer"]) assert.equal(resultadoDoErro(c), "erro", c);
});

test("linhaDeSucesso: sucesso completo", () => {
  const l = linhaDeSucesso(ctx, {
    alteracoes,
    avisos: [],
    comentario: { publicado: true, id: 99 },
    assesments: { total: 1, atualizados: [5], jaIguais: [], falhas: [] },
  });
  assert.equal(l.resultado, "sucesso");
  assert.equal(l.motivo, null);
  assert.equal(l.avisos, null);
  assert.equal(l.comentarioPublicado, true);
  assert.equal(l.comentarioId, 99);
  assert.deepEqual(l.alteracoes, alteracoes);
  assert.equal(l.revisaoAntes, 13);
  assert.equal(l.usuario, "ana@nstech.com.br");
});

test("linhaDeSucesso: comentário que falhou ou Assesment que falhou = parcial, com os detalhes", () => {
  const semComentario = linhaDeSucesso(ctx, {
    alteracoes,
    avisos: ["O PBI foi movido, mas o comentário falhou"],
    comentario: { publicado: false, erro: "HTTP 503" },
    assesments: null,
  });
  assert.equal(semComentario.resultado, "parcial");
  assert.equal(semComentario.comentarioPublicado, false);
  assert.equal(semComentario.comentarioErro, "HTTP 503");
  assert.deepEqual(semComentario.avisos, ["O PBI foi movido, mas o comentário falhou"]);

  const assesmentFalhou = linhaDeSucesso(ctx, {
    alteracoes,
    avisos: [],
    comentario: { publicado: true, id: 1 },
    assesments: { total: 2, atualizados: [1], jaIguais: [], falhas: [{ id: 2, erro: "fechado" }] },
  });
  assert.equal(assesmentFalhou.resultado, "parcial");
  assert.deepEqual(assesmentFalhou.assesments?.falhas, [{ id: 2, erro: "fechado" }]);
});

test("linhaDeSucesso: sem alteração gravada não conta comentário como falha", () => {
  const l = linhaDeSucesso(ctx, { alteracoes: [], avisos: [], comentario: { publicado: false }, assesments: null });
  assert.equal(l.resultado, "sucesso");
  assert.equal(l.comentarioPublicado, null);
});

test("linhaDeFalha: bloqueado com as faltas no motivo; conflito; sem permissão", () => {
  const b = linhaDeFalha(ctx, { codigo: "regra", mensagem: "O movimento não cumpre as regras.", faltas: ["Preencher a Data Comitê.", "Preencher o Cliente."] });
  assert.equal(b.resultado, "bloqueado");
  assert.equal(b.motivo, "O movimento não cumpre as regras. | Preencher a Data Comitê. | Preencher o Cliente.");
  assert.equal(b.alteracoes, null);
  assert.equal(b.origem, "1.2");
  assert.equal(linhaDeFalha(ctx, { codigo: "conflito", mensagem: "x" }).resultado, "conflito");
  assert.equal(linhaDeFalha(ctx, { codigo: "sem_permissao", mensagem: "x" }).resultado, "sem_permissao");
  assert.equal(linhaDeFalha(ctx, { codigo: "indisponivel", mensagem: "x" }).resultado, "erro");
  assert.ok(linhaDeFalha(ctx, { codigo: "erro", mensagem: "x".repeat(5000) }).motivo!.length <= 1000);
});

test("checklist: itens das 3 etapas com movimento, ids únicos e válidos", () => {
  assert.deepEqual(Object.keys(CHECKLIST_POR_ETAPA).sort(), ["1.1", "1.2", "2.1"]);
  for (const e of ETAPAS_FLUXO) assert.equal(!!CHECKLIST_POR_ETAPA[e.codigo], e.movimenta, `etapa ${e.codigo}`);
  assert.equal(CHECKLIST_POR_ETAPA["1.1"]!.length, 3);
  assert.equal(CHECKLIST_POR_ETAPA["1.2"]!.length, 2);
  assert.equal(CHECKLIST_POR_ETAPA["2.1"]!.length, 5);
  for (const itens of Object.values(CHECKLIST_POR_ETAPA)) {
    const ids = itens!.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, "ids repetidos");
    for (const id of ids) assert.match(id, /^[a-z]+(-[a-z]+)*$/);
  }
  assert.equal(itemDeChecklistValido("2.1", "estimativa-qa"), true);
  assert.equal(itemDeChecklistValido("1.1", "estimativa-qa"), false);
  assert.equal(itemDeChecklistValido("3.1", "qualquer"), false);
});

test("linhaDeEdicao: direção 'edicao', destino = etapa depois da edição, sem comentário; parcial só se um Assesment falhou", () => {
  const ctxEdicao = { ...ctx, direcao: "edicao" as const, destino: "1.2" };
  const ok = linhaDeEdicao(ctxEdicao, { alteracoes, avisos: [], assesments: null, etapaDepois: "1.1" });
  assert.equal(ok.direcao, "edicao");
  assert.equal(ok.resultado, "sucesso");
  assert.equal(ok.destino, "1.1");
  assert.equal(ok.origem, "1.2");
  assert.equal(ok.comentarioPublicado, null);
  assert.equal(ok.avisos, null);
  const semEtapa = linhaDeEdicao(ctxEdicao, { alteracoes, avisos: ["x"], assesments: null, etapaDepois: null });
  assert.equal(semEtapa.destino, "1.2");
  assert.deepEqual(semEtapa.avisos, ["x"]);
  const parcial = linhaDeEdicao(ctxEdicao, { alteracoes, avisos: [], assesments: { total: 1, atualizados: [], jaIguais: [], falhas: [{ id: 5, erro: "fechado" }] }, etapaDepois: "1.2" });
  assert.equal(parcial.resultado, "parcial");
});

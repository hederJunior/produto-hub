// Requisitos de segurança (1.2) com Azure e log simulados. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerSegurancaDoPbi, registrarSeguranca, type DependenciasSeguranca } from "./fluxo-po-seguranca-servidor";
import { ErroFluxoPo } from "./fluxo-po-servidor";
import { PERGUNTAS_SEGURANCA, lerSegurancaDaDescricao, montarBlocoSeguranca, type ItemSeguranca } from "./fluxo-po-seguranca";
import type { PbiFluxo } from "./fluxo-po";
import type { LinhaLogMovimento } from "./fluxo-po-log";

const po = { email: "ana@nstech.com.br", nome: "Ana", tipo: "comum", papel: "PO" };
const leitor = { email: "leo@nstech.com.br", nome: "Leo", tipo: "comum", papel: null };

const respostas = (): ItemSeguranca[] => PERGUNTAS_SEGURANCA.map((p, i) => ({ id: p.id, resposta: i % 2 ? "nao" : "sim", observacao: i === 0 ? "obs" : "" }));

/** PBI na 1.2: Status Backlog, Etapa Backlog e esteira definida (Area Path filho) — o que `derivarEtapa` chama de 1.2. */
const pbiNa12 = { id: 46766, status: "Backlog", etapa: "Backlog", areaPath: "KMM5\\TMS - Melhorias", tags: "", rev: 40 } as unknown as PbiFluxo;

function montar(opcoes: { descricao?: string; pbi?: PbiFluxo } = {}) {
  const chamadas: { patches: { id: number; ops: { op: string; path: string; value?: unknown }[] }[]; logs: LinhaLogMovimento[] } = { patches: [], logs: [] };
  let descricao = opcoes.descricao ?? "<p>Chamado do cliente</p>";
  let rev = 40;
  const deps: DependenciasSeguranca = {
    lerPbi: async () => opcoes.pbi ?? pbiNa12,
    lerDescricao: async () => ({ rev, descricaoBruta: descricao }),
    aplicarPatch: async (id, ops) => {
      chamadas.patches.push({ id, ops: ops as never });
      const nova = ops.find((o) => o.path === "/fields/System.Description");
      if (nova) descricao = String(nova.value);
      rev += 1;
      return { rev };
    },
    registrarLog: async (linha) => {
      chamadas.logs.push(linha);
      return true;
    },
    agora: () => new Date("2026-11-25T15:30:00Z"),
  };
  return { deps, chamadas, descricaoAtual: () => descricao };
}

async function recusa(promessa: Promise<unknown>, status: number, codigo: string) {
  await assert.rejects(promessa, (e: unknown) => e instanceof ErroFluxoPo && e.status === status && e.codigo === codigo);
}

test("a etapa de teste do PBI simulado é mesmo a 1.2", async () => {
  const { deps } = montar();
  assert.equal((await lerSegurancaDoPbi(46766, deps)).etapa, "1.2");
});

test("registra: acrescenta o bloco ao fim da Description, com test /rev, e vai para o log", async () => {
  const { deps, chamadas, descricaoAtual } = montar();
  const r = await registrarSeguranca({ id: 46766, respostas: respostas(), base: null, usuario: po, deps });
  assert.equal(chamadas.patches.length, 1);
  assert.deepEqual(chamadas.patches[0].ops[0], { op: "test", path: "/rev", value: 40 });
  assert.equal(chamadas.patches[0].ops[1].path, "/fields/System.Description");
  assert.ok(descricaoAtual().startsWith("<p>Chamado do cliente</p>"));
  assert.deepEqual(lerSegurancaDaDescricao(descricaoAtual()), respostas());
  assert.equal(r.estado.registrado, true);
  assert.deepEqual(r.estado.itens, respostas());
  assert.match(descricaoAtual(), /Registrado por Ana em 25\/11\/2026 12:30/);
  assert.equal(chamadas.logs[0].direcao, "seguranca");
  assert.equal(chamadas.logs[0].resultado, "sucesso");
  assert.equal(chamadas.logs[0].origem, "1.2");
});

test("registrar de novo (base = o que estava) substitui o bloco e deixa um só", async () => {
  const { deps, descricaoAtual } = montar({ descricao: `<p>Chamado</p>${montarBlocoSeguranca(respostas())}<p>Final</p>` });
  const novas = respostas().map((i) => ({ ...i, resposta: "na" as const }));
  await registrarSeguranca({ id: 46766, respostas: novas, base: respostas(), usuario: po, deps });
  assert.equal((descricaoAtual().match(/kmm-requisitos-seguranca/g) ?? []).length, 1);
  assert.ok(descricaoAtual().startsWith("<p>Chamado</p>") && descricaoAtual().endsWith("<p>Final</p>"));
  assert.deepEqual(lerSegurancaDaDescricao(descricaoAtual()), novas);
});

test("outra pessoa mudou o formulário depois que a tela abriu: 409 e nada gravado", async () => {
  const outra = respostas().map((i) => ({ ...i, resposta: "na" as const }));
  const { deps, chamadas } = montar({ descricao: montarBlocoSeguranca(outra) });
  await recusa(registrarSeguranca({ id: 46766, respostas: respostas(), base: respostas(), usuario: po, deps }), 409, "conflito");
  assert.equal(chamadas.patches.length, 0);
  assert.equal(chamadas.logs[0].resultado, "conflito");
});

test("tela abriu sem formulário, mas já existe um no Azure: 409", async () => {
  const { deps, chamadas } = montar({ descricao: montarBlocoSeguranca(respostas()) });
  await recusa(registrarSeguranca({ id: 46766, respostas: respostas(), base: null, usuario: po, deps }), 409, "conflito");
  assert.equal(chamadas.patches.length, 0);
});

test("mudança em OUTRA parte da Description não impede o registro", async () => {
  const { deps, descricaoAtual } = montar({ descricao: "<p>Texto que mudou desde que a tela abriu</p>" });
  await registrarSeguranca({ id: 46766, respostas: respostas(), base: null, usuario: po, deps });
  assert.ok(descricaoAtual().startsWith("<p>Texto que mudou desde que a tela abriu</p>"));
});

test("sem permissão: 403, nada gravado, vai para o log", async () => {
  const { deps, chamadas } = montar();
  await recusa(registrarSeguranca({ id: 46766, respostas: respostas(), base: null, usuario: leitor, deps }), 403, "sem_permissao");
  assert.equal(chamadas.patches.length, 0);
  assert.equal(chamadas.logs[0].resultado, "sem_permissao");
});

test("card fora da 1.2: 422 e nada gravado", async () => {
  const pbi = { ...pbiNa12, etapa: "Comitê", dataComite: "2026-11-20T03:00:00Z" } as unknown as PbiFluxo;
  const { deps, chamadas } = montar({ pbi });
  await recusa(registrarSeguranca({ id: 46766, respostas: respostas(), base: null, usuario: po, deps }), 422, "regra");
  assert.equal(chamadas.patches.length, 0);
});

test("formulário incompleto e ID inválido: 422", async () => {
  const { deps, chamadas } = montar();
  await recusa(registrarSeguranca({ id: 46766, respostas: respostas().slice(0, 3), base: null, usuario: po, deps }), 422, "entrada_invalida");
  await recusa(registrarSeguranca({ id: "x", respostas: respostas(), base: null, usuario: po, deps }), 422, "entrada_invalida");
  assert.equal(chamadas.patches.length, 0);
});

test("lerSegurancaDoPbi: em branco quando não há; preenchido quando há", async () => {
  const sem = await lerSegurancaDoPbi(46766, montar().deps);
  assert.equal(sem.registrado, false);
  assert.equal(sem.itens.every((i) => i.resposta === null), true);
  const com = await lerSegurancaDoPbi(46766, montar({ descricao: montarBlocoSeguranca(respostas()) }).deps);
  assert.equal(com.registrado, true);
  assert.deepEqual(com.itens, respostas());
});

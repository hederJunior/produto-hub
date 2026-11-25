// Testes do botão "Necessário análise tech" (tag "Para refinamento tech") com Azure e log simulados. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerTagTech, marcarNecessarioAnaliseTech, type DependenciasTagTech } from "./fluxo-po-tag-tech-servidor";
import { ErroFluxoPo } from "./fluxo-po-servidor";
import type { PbiFluxo } from "./fluxo-po";
import type { LinhaLogMovimento } from "./fluxo-po-log";

const po = { email: "ana@nstech.com.br", nome: "Ana", tipo: "comum", papel: "PO" };
const leitor = { email: "leo@nstech.com.br", nome: "Leo", tipo: "comum", papel: null };

function montar(opcoes: { etapa?: string; tags?: string } = {}) {
  const chamadas: { patches: { id: number; ops: unknown[] }[]; logs: LinhaLogMovimento[] } = { patches: [], logs: [] };
  let tags = opcoes.tags ?? "GLPI; cliente-vip";
  const deps: DependenciasTagTech = {
    lerPbi: async () => ({ id: 46766, status: "Backlog", etapa: opcoes.etapa ?? "Comitê", areaPath: "KMM5\\TMS - SWAT", tags, dataComite: "2026-11-20T03:00:00Z", rev: 30 }) as unknown as PbiFluxo,
    aplicarPatch: async (id, ops) => {
      chamadas.patches.push({ id, ops });
      const novo = ops.find((o) => o.path === "/fields/System.Tags");
      if (novo) tags = String(novo.value);
      return { rev: 31 };
    },
    registrarLog: async (linha) => {
      chamadas.logs.push(linha);
      return true;
    },
  };
  return { deps, chamadas };
}

async function recusa(promessa: Promise<unknown>, status: number, codigo: string) {
  await assert.rejects(promessa, (e: unknown) => e instanceof ErroFluxoPo && e.status === status && e.codigo === codigo);
}

test("acrescenta a tag mantendo as outras, com test /rev, e registra no log", async () => {
  const { deps, chamadas } = montar();
  const r = await marcarNecessarioAnaliseTech({ id: 46766, usuario: po, deps });
  assert.deepEqual(chamadas.patches, [{ id: 46766, ops: [{ op: "test", path: "/rev", value: 30 }, { op: "add", path: "/fields/System.Tags", value: "GLPI; cliente-vip; Para refinamento tech" }] }]);
  assert.equal(r.aplicada, true);
  assert.equal(r.jaTinha, false);
  assert.equal(r.tags, "GLPI; cliente-vip; Para refinamento tech");
  assert.equal(chamadas.logs[0].direcao, "tag");
  assert.equal(chamadas.logs[0].resultado, "sucesso");
  assert.equal(chamadas.logs[0].origem, "2.1");
});

test("PBI sem nenhuma tag: fica só com a nova", async () => {
  const { deps, chamadas } = montar({ tags: "" });
  await marcarNecessarioAnaliseTech({ id: 46766, usuario: po, deps });
  assert.equal((chamadas.patches[0].ops[1] as { value: string }).value, "Para refinamento tech");
});

test("já tem a tag (qualquer caixa/acento): não grava, avisa e registra", async () => {
  const { deps, chamadas } = montar({ tags: "GLPI; PARA REFINAMENTO TECH" });
  const r = await marcarNecessarioAnaliseTech({ id: 46766, usuario: po, deps });
  assert.equal(chamadas.patches.length, 0);
  assert.equal(r.jaTinha, true);
  assert.match(r.avisos[0], /já tem a tag/);
  assert.equal(chamadas.logs.length, 1);
});

test("a tag parecida 'Pronto para refinamento tech' NÃO conta como já aplicada", async () => {
  const { deps, chamadas } = montar({ tags: "Pronto para refinamento tech" });
  const r = await marcarNecessarioAnaliseTech({ id: 46766, usuario: po, deps });
  assert.equal(r.jaTinha, false);
  assert.equal((chamadas.patches[0].ops[1] as { value: string }).value, "Pronto para refinamento tech; Para refinamento tech");
});

test("sem permissão: 403, nada gravado, vai para o log", async () => {
  const { deps, chamadas } = montar();
  await recusa(marcarNecessarioAnaliseTech({ id: 46766, usuario: leitor, deps }), 403, "sem_permissao");
  assert.equal(chamadas.patches.length, 0);
  assert.equal(chamadas.logs[0].resultado, "sem_permissao");
});

test("card fora da 2.1: 422 e nada gravado", async () => {
  const { deps, chamadas } = montar({ etapa: "Backlog" });
  await recusa(marcarNecessarioAnaliseTech({ id: 46766, usuario: po, deps }), 422, "regra");
  assert.equal(chamadas.patches.length, 0);
});

test("ID inválido: 422", async () => {
  const { deps } = montar();
  await recusa(marcarNecessarioAnaliseTech({ id: "x", usuario: po, deps }), 422, "entrada_invalida");
});

test("lerTagTech: informa se o PBI já tem a tag", async () => {
  assert.deepEqual(await lerTagTech(46766, montar({ tags: "GLPI" }).deps), { aplicada: false });
  assert.deepEqual(await lerTagTech(46766, montar({ tags: "GLPI; Para refinamento tech" }).deps), { aplicada: true });
});

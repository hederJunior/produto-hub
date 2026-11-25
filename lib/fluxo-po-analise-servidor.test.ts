// Testes do registro da "Análise" (Description do Assesment) com Azure e log simulados. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerAnalisesDoPbi, registrarAnalise, type DependenciasAnalise } from "./fluxo-po-analise-servidor";
import { ErroFluxoPo } from "./fluxo-po-servidor";
import type { PbiFluxo } from "./fluxo-po";
import type { LinhaLogMovimento } from "./fluxo-po-log";

const po = { email: "ana@nstech.com.br", nome: "Ana", tipo: "comum", papel: "PO" };
const leitor = { email: "leo@nstech.com.br", nome: "Leo", tipo: "comum", papel: null };

const pbiEm = (etapa: string, status = "Backlog"): PbiFluxo =>
  ({ id: 46766, status, etapa, areaPath: "KMM5\\TMS - SWAT", tags: [], dataComite: "2026-11-20T03:00:00Z", rev: 30 }) as unknown as PbiFluxo;

function montar(opcoes: { pbi?: PbiFluxo; filhos?: number[]; revAssesment?: number; descricao?: string } = {}) {
  const chamadas: { patches: { id: number; ops: unknown[] }[]; logs: LinhaLogMovimento[] } = { patches: [], logs: [] };
  let revAtual = opcoes.revAssesment ?? 5;
  let descricao = opcoes.descricao ?? "<div>texto antigo</div>";
  const deps: DependenciasAnalise = {
    lerPbi: async () => opcoes.pbi ?? pbiEm("Comitê"),
    listarFilhos: async () => (opcoes.filhos ?? [46767]).map((id) => ({ id })),
    lerAssesment: async (id) => ({ id, rev: revAtual, titulo: `Assesment ${id}`, estado: "New", tipo: "Assesment", descricaoBruta: descricao }),
    aplicarPatch: async (id, ops) => {
      chamadas.patches.push({ id, ops });
      const novo = ops.find((o) => o.path === "/fields/System.Description");
      if (novo) descricao = String(novo.value);
      revAtual += 1;
      return { rev: revAtual };
    },
    registrarLog: async (linha) => {
      chamadas.logs.push(linha);
      return true;
    },
  };
  return { deps, chamadas };
}

const pedido = (extra: Record<string, unknown> = {}) => ({ id: 46766, assesmentId: 46767, html: "<p>Análise nova</p>", rev: 5, usuario: po, ...extra });

async function recusa(promessa: Promise<unknown>, status: number, codigo: string) {
  await assert.rejects(promessa, (e: unknown) => e instanceof ErroFluxoPo && e.status === status && e.codigo === codigo);
}

test("sucesso: grava o Description com test /rev, relê e registra no log", async () => {
  const { deps, chamadas } = montar();
  const r = await registrarAnalise({ ...pedido(), html: '<div onclick="x()">Escopo <b>fechado</b></div><script>1</script>', deps });
  assert.deepEqual(chamadas.patches, [
    { id: 46767, ops: [{ op: "test", path: "/rev", value: 5 }, { op: "add", path: "/fields/System.Description", value: "<div>Escopo <b>fechado</b></div>" }] },
  ]);
  assert.equal(r.assesment.html, "<div>Escopo <b>fechado</b></div>");
  assert.equal(r.assesment.rev, 6);
  assert.equal(chamadas.logs.length, 1);
  assert.equal(chamadas.logs[0].direcao, "analise");
  assert.equal(chamadas.logs[0].resultado, "sucesso");
  assert.equal(chamadas.logs[0].workItemId, 46766);
  assert.equal(chamadas.logs[0].origem, "2.1");
  assert.equal(chamadas.logs[0].alteracoes?.[0].rotulo, "Análise (Assesment 46767)");
});

test("sem permissão (só visualiza): 403, nada gravado, tentativa vai para o log", async () => {
  const { deps, chamadas } = montar();
  await recusa(registrarAnalise({ ...pedido({ usuario: leitor }), deps }), 403, "sem_permissao");
  assert.equal(chamadas.patches.length, 0);
  assert.equal(chamadas.logs[0].resultado, "sem_permissao");
});

test("card fora da etapa 2.1: 422 e nada gravado", async () => {
  const { deps, chamadas } = montar({ pbi: pbiEm("Backlog") });
  await recusa(registrarAnalise({ ...pedido(), deps }), 422, "regra");
  assert.equal(chamadas.patches.length, 0);
  assert.equal(chamadas.logs[0].resultado, "bloqueado");
});

test("Assesment que não é filho do PBI: 422 e nada gravado", async () => {
  const { deps, chamadas } = montar({ filhos: [11111] });
  await recusa(registrarAnalise({ ...pedido(), deps }), 422, "entrada_invalida");
  assert.equal(chamadas.patches.length, 0);
});

test("Assesment mudou no Azure depois que a tela abriu: 409 e nada gravado", async () => {
  const { deps, chamadas } = montar({ revAssesment: 9 });
  await recusa(registrarAnalise({ ...pedido({ rev: 5 }), deps }), 409, "conflito");
  assert.equal(chamadas.patches.length, 0);
  assert.equal(chamadas.logs[0].resultado, "conflito");
});

test("entrada inválida: texto vazio, ids e revisão", async () => {
  const { deps, chamadas } = montar();
  await recusa(registrarAnalise({ ...pedido({ html: "<div><br></div>" }), deps }), 422, "entrada_invalida");
  await recusa(registrarAnalise({ ...pedido({ html: undefined }), deps }), 422, "entrada_invalida");
  await recusa(registrarAnalise({ ...pedido({ assesmentId: "x" }), deps }), 422, "entrada_invalida");
  await recusa(registrarAnalise({ ...pedido({ rev: null }), deps }), 422, "entrada_invalida");
  assert.equal(chamadas.patches.length, 0);
});

test("erro do Azure no PATCH vira falha no log e é propagado", async () => {
  const { deps, chamadas } = montar();
  deps.aplicarPatch = async () => {
    throw new ErroFluxoPo(409, "conflito", "O item mudou.");
  };
  await recusa(registrarAnalise({ ...pedido(), deps }), 409, "conflito");
  assert.equal(chamadas.logs[0].resultado, "conflito");
});

test("lerAnalisesDoPbi: devolve os Assesments com HTML sanitizado e as perdas", async () => {
  const { deps } = montar({ filhos: [46768, 46767], descricao: '<div style="color:red">Texto <img src="x.png"><script>1</script></div>' });
  const { assesments } = await lerAnalisesDoPbi(46766, deps);
  assert.deepEqual(assesments.map((a) => a.id), [46767, 46768]);
  assert.equal(assesments[0].html, "<div>Texto <em>[imagem]</em></div>");
  assert.deepEqual(assesments[0].perdas, { imagens: 1, estilos: true });
  assert.equal(assesments[0].vazia, false);
});

test("lerAnalisesDoPbi: PBI sem Assesment devolve lista vazia", async () => {
  const { deps } = montar({ filhos: [] });
  assert.deepEqual((await lerAnalisesDoPbi(46766, deps)).assesments, []);
});

// Retentativa das consultas WIQL do Azure DevOps (fetch simulado). Rodar: npm run test:wiql
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ErroWiql, wiqlIdsComRetentativa } from "./devops-client";

const fetchOriginal = globalThis.fetch;
const setTimeoutOriginal = globalThis.setTimeout;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  globalThis.setTimeout = setTimeoutOriginal;
});

/** fetch que devolve as respostas da fila, na ordem (Error = falha de rede); setTimeout sem espera real. */
function simular(respostas: (Response | Error)[]) {
  let chamadas = 0;
  globalThis.fetch = (async () => {
    const r = respostas[Math.min(chamadas++, respostas.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  globalThis.setTimeout = ((fn: () => void) => setTimeoutOriginal(fn, 0)) as typeof setTimeout;
  return () => chamadas;
}
const ok = (ids: number[]) => new Response(JSON.stringify({ workItems: ids.map((id) => ({ id })) }), { status: 200 });

test("resposta boa: devolve os IDs, uma chamada", async () => {
  const chamadas = simular([ok([1, 2])]);
  assert.deepEqual(await wiqlIdsComRetentativa("org", "pat", "KMM5", "SELECT 1"), [1, 2]);
  assert.equal(chamadas(), 1);
});

test("429 e erro de rede são repetidos e a consulta termina bem", async () => {
  const chamadas = simular([new Response("limite", { status: 429, headers: { "retry-after": "1" } }), new Error("fetch failed"), new Response("indisponível", { status: 503 }), ok([7])]);
  assert.deepEqual(await wiqlIdsComRetentativa("org", "pat", "KMM5", "SELECT 1"), [7]);
  assert.equal(chamadas(), 4);
});

test("falha momentânea que não passa: desiste depois de 4 tentativas, com o status", async () => {
  const chamadas = simular([new Response("fora do ar", { status: 503 })]);
  await assert.rejects(wiqlIdsComRetentativa("org", "pat", "KMM5", "SELECT 1"), (e: unknown) => e instanceof ErroWiql && e.status === 503);
  assert.equal(chamadas(), 4);
});

test("400 (State inexistente) falha na hora, sem repetir", async () => {
  const chamadas = simular([new Response("TF51011: state inválido", { status: 400 })]);
  await assert.rejects(wiqlIdsComRetentativa("org", "pat", "KMM5", "SELECT 1"), (e: unknown) => e instanceof ErroWiql && e.status === 400 && /TF51011/.test(e.message));
  assert.equal(chamadas(), 1);
});

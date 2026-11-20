// Testes da montagem do checklist. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import { instanteUtc, montarChecklist, resumoDoChecklist } from "./fluxo-po-checklist";

test("sem linhas: todas as etapas com checklist, todos os itens desmarcados, na ordem das definições", () => {
  const c = montarChecklist([]);
  assert.deepEqual(Object.keys(c).sort(), ["1.1", "1.2", "2.1"]);
  assert.deepEqual(c["1.1"]!.map((i) => i.id), ["entendimento-dor", "aderencia-estrategia", "distribuicao-esteiras"]);
  assert.deepEqual(c["2.1"]!.map((i) => i.id), ["construir-proposta", "apresentacao-comite", "estimativa-tech", "estimativa-qa", "definicao-delivery"]);
  for (const itens of Object.values(c)) for (const i of itens!) assert.deepEqual([i.marcado, i.marcadoPor, i.marcadoEm], [false, null, null]);
  assert.ok(c["1.1"]![0].rotulo.length > 5);
});

test("linhas marcadas aparecem com quem e quando; desmarcadas limpam os dois; itens desconhecidos são ignorados", () => {
  const c = montarChecklist([
    { etapa: "1.1", itemId: "entendimento-dor", marcado: true, marcadoPor: "Ana", marcadoEm: "2026-11-20T18:00:00.000Z" },
    { etapa: "1.1", itemId: "aderencia-estrategia", marcado: false, marcadoPor: "Ana", marcadoEm: "2026-11-20T18:05:00.000Z" }, // resíduo: desmarcado
    { etapa: "2.1", itemId: "estimativa-qa", marcado: true, marcadoPor: null, marcadoEm: null },
    { etapa: "1.2", itemId: "item-que-nao-existe-mais", marcado: true, marcadoPor: "X", marcadoEm: "2026-01-01T00:00:00.000Z" },
    { etapa: "3.1", itemId: "qualquer", marcado: true, marcadoPor: "X", marcadoEm: "2026-01-01T00:00:00.000Z" },
  ]);
  assert.deepEqual(c["1.1"]![0], { id: "entendimento-dor", rotulo: c["1.1"]![0].rotulo, marcado: true, marcadoPor: "Ana", marcadoEm: "2026-11-20T18:00:00.000Z" });
  assert.deepEqual([c["1.1"]![1].marcado, c["1.1"]![1].marcadoPor, c["1.1"]![1].marcadoEm], [false, null, null]);
  assert.equal(c["2.1"]!.find((i) => i.id === "estimativa-qa")!.marcado, true);
  assert.equal(c["2.1"]!.find((i) => i.id === "estimativa-qa")!.marcadoPor, null);
  assert.equal(c["1.2"]!.some((i) => i.marcado), false);
  assert.equal((c as Record<string, unknown>)["3.1"], undefined);
});

test("resumoDoChecklist: feitos e total", () => {
  const c = montarChecklist([
    { etapa: "2.1", itemId: "construir-proposta", marcado: true, marcadoPor: "A", marcadoEm: "2026-11-20T00:00:00.000Z" },
    { etapa: "2.1", itemId: "estimativa-tech", marcado: true, marcadoPor: "A", marcadoEm: "2026-11-20T00:00:00.000Z" },
  ]);
  assert.deepEqual(resumoDoChecklist(c["2.1"]), { feitos: 2, total: 5 });
  assert.deepEqual(resumoDoChecklist(c["1.1"]), { feitos: 0, total: 3 });
  assert.deepEqual(resumoDoChecklist(undefined), { feitos: 0, total: 0 });
});

test("instanteUtc: instante sem fuso (como o banco devolve) ganha Z; com fuso fica igual; vazio vira null", () => {
  assert.equal(instanteUtc("2026-11-20T23:47:54.857"), "2026-11-20T23:47:54.857Z");
  assert.equal(instanteUtc("2026-11-20 23:47:54"), "2026-11-20T23:47:54Z");
  assert.equal(instanteUtc("2026-11-20T23:47:54.857Z"), "2026-11-20T23:47:54.857Z");
  assert.equal(instanteUtc("2026-11-20T20:47:54-03:00"), "2026-11-20T20:47:54-03:00");
  assert.equal(instanteUtc(""), null);
  assert.equal(instanteUtc(null), null);
  // e o horário exibido em Brasília é o certo (23:47 UTC = 20:47 em Brasília)
  assert.equal(new Date(instanteUtc("2026-11-20T23:47:54.857")!).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }), "20:47");
});

test("montarChecklist: marcadoEm sem fuso sai como ISO UTC", () => {
  const c = montarChecklist([{ etapa: "1.1", itemId: "entendimento-dor", marcado: true, marcadoPor: "Ana", marcadoEm: "2026-11-20T23:47:54.857" }]);
  assert.equal(c["1.1"]![0].marcadoEm, "2026-11-20T23:47:54.857Z");
});

// Escopo de áreas da Previsão de Entregas. Rodar: npm run test:previsao-entregas
import { test } from "node:test";
import assert from "node:assert/strict";
import { areaDaPrevisao, restringirPrevisao, type ItemPrevisao, type SprintPrevisao } from "./previsao-entregas";

const item = (id: number, areaPath: string, iterationPath: string): ItemPrevisao => ({ id, titulo: `PBI ${id}`, areaPath, projeto: "KMM5", iterationPath, state: "Execução", etapa: "", cliente: "", po: "", classificacao: "" });
const sprint = (chave: string): SprintPrevisao => ({ chave, projeto: "KMM5", nome: chave.split("\\")[2], inicio: null, fim: null });

test("reconhece as duas áreas (prefixo TMS, sem acento, caixa e KMM4/KMM5)", () => {
  assert.equal(areaDaPrevisao("KMM5\\TMS - Projetos de Implantacao"), true);
  assert.equal(areaDaPrevisao("KMM5\\TMS - Projetos de Implantação"), true);
  assert.equal(areaDaPrevisao("KMM5\\Obrigações Legais e Financeiras"), true);
  assert.equal(areaDaPrevisao("KMM4\\TMS - OBRIGACOES LEGAIS E FINANCEIRAS"), true);
});

test("recusa as outras áreas, a raiz e vazio", () => {
  for (const a of ["KMM5\\TMS - SWAT", "KMM5\\TMS - Ecossistema", "KMM5", "KMM5\\TMS - Projetos de Implantacao\\Filha", "", null, undefined]) assert.equal(areaDaPrevisao(a), false, String(a));
});

test("restringirPrevisao: só PBIs das áreas e só sprints que ainda têm PBI", () => {
  const s1 = "KMM5\\2026\\Sprint 8.19";
  const s2 = "KMM5\\2026\\Sprint 8.20";
  const r = restringirPrevisao(
    [item(1, "KMM5\\TMS - Projetos de Implantacao", s1), item(2, "KMM5\\TMS - SWAT", s1), item(3, "KMM5\\TMS - SWAT", s2), item(4, "KMM5\\TMS - Obrigações Legais e Financeiras", s1)],
    [sprint(s1), sprint(s2)]
  );
  assert.deepEqual(r.itens.map((i) => i.id), [1, 4]);
  assert.deepEqual(r.sprints.map((s) => s.chave), [s1]);
});

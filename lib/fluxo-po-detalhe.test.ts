// Testes da montagem de anexos e histórico do detalhe do PBI. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarAnexos, montarHistorico, type UpdateAzure } from "./fluxo-po-detalhe";

const URL_ANEXO = "https://dev.azure.com/org/proj/_apis/wit/attachments/149B7752-F4DD-47DD-BF30-493D0068BCBD";

const updates: UpdateAzure[] = [
  {
    rev: 1,
    revisedDate: "2026-10-02T20:21:10.613Z",
    revisedBy: { displayName: "Integração GLPI" },
    fields: {
      "System.Rev": { newValue: 1 },
      "System.Title": { newValue: "Chamado X" },
      "System.State": { newValue: "Backlog" },
      "Custom.Etapa": { newValue: "Backlog" },
    },
    relations: { added: [{ rel: "AttachedFile", url: URL_ANEXO.toLowerCase(), attributes: { name: "doc.pdf" } }] },
  },
  { rev: 2, revisedDate: "2026-10-03T10:00:00Z", revisedBy: { displayName: "Ana" }, fields: { "System.ChangedDate": { oldValue: "a", newValue: "b" }, "System.Rev": { oldValue: 1, newValue: 2 } } },
  {
    rev: 3,
    revisedDate: "2026-11-20T18:00:00Z",
    revisedBy: { displayName: "Heder" },
    fields: {
      "Custom.Etapa": { oldValue: "Backlog", newValue: "Comitê" },
      "Custom.443622e0-6ab8-4ae5-9371-612b44a8fb1d": { newValue: "2026-12-10T03:00:00Z" },
      "System.AssignedTo": { oldValue: { displayName: "Fulano" }, newValue: { displayName: "Beltrano" } },
    },
  },
  { rev: 4, revisedBy: null, fields: { "System.Tags": { oldValue: "a", newValue: "a" } } },
];

test("montarHistorico: só campos relevantes que mudaram, mais recente primeiro, sem revisões sem mudança", () => {
  const h = montarHistorico(updates);
  assert.deepEqual(h.map((e) => e.rev), [3, 1]);
  assert.equal(h[0].usuario, "Heder");
  assert.deepEqual(h[0].mudancas, [
    { campo: "Etapa", de: "Backlog", para: "Comitê" },
    { campo: "Data Comitê", de: null, para: "2026-12-10" },
    { campo: "Responsável", de: "Fulano", para: "Beltrano" },
  ]);
  assert.deepEqual(h[1].mudancas.map((m) => m.campo), ["Título", "Status", "Etapa", "Anexo"]);
  assert.deepEqual(h[1].mudancas.at(-1), { campo: "Anexo", de: null, para: "doc.pdf" });
});

test("montarHistorico: anexo removido e lista vazia", () => {
  const h = montarHistorico([{ rev: 5, revisedBy: { displayName: "X" }, relations: { removed: [{ rel: "AttachedFile", attributes: { name: "velho.pdf" } }, { rel: "Hierarchy-Forward" }] } }]);
  assert.deepEqual(h[0].mudancas, [{ campo: "Anexo", de: "velho.pdf", para: null }]);
  assert.deepEqual(montarHistorico([]), []);
});

test("montarAnexos: nome, tamanho, link e autor/data da revisão em que foi adicionado", () => {
  const a = montarAnexos(
    [
      { rel: "AttachedFile", url: URL_ANEXO, attributes: { name: "doc.pdf", resourceSize: 244820, resourceCreatedDate: "2026-10-02T20:21:10.613Z" } },
      { rel: "Hierarchy-Forward", url: "https://dev.azure.com/org/proj/_apis/wit/workItems/1" },
      { rel: "AttachedFile", url: "https://dev.azure.com/org/proj/_apis/wit/attachments/outro", attributes: { name: "sem-historico.png" } },
    ],
    updates,
  );
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], { nome: "doc.pdf", tamanho: 244820, autor: "Integração GLPI", quando: "2026-10-02T20:21:10.613Z", link: URL_ANEXO });
  assert.equal(a[1].autor, null);
  assert.equal(a[1].tamanho, null);
});

test("montarAnexos: PBI sem anexos", () => {
  assert.deepEqual(montarAnexos(undefined), []);
  assert.deepEqual(montarAnexos([]), []);
  assert.deepEqual(montarAnexos([{ rel: "Related", url: "x" }]), []);
});

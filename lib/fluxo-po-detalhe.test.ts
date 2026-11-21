// Testes da montagem de anexos e histórico do detalhe do PBI. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import { instanteDaRevisao, montarAnexos, montarHistorico, montarMovimentos, type UpdateAzure } from "./fluxo-po-detalhe";

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

test("montarMovimentos: mais recente primeiro, nome ou e-mail, instante com Z, listas JSON seguras", () => {
  const m = montarMovimentos([
    { id: "a", criadoEm: "2026-11-20T10:00:00.000", origem: "1.2", destino: "2.1", direcao: "avanco", proposta: false, usuario: "ana@x.com", usuarioNome: "Ana", resultado: "sucesso", motivo: null, alteracoes: [{ campo: "Custom.Etapa", rotulo: "Etapa", de: "Backlog", para: "Comitê" }], avisos: null, comentarioPublicado: true, assesments: { total: 1, atualizados: [5], jaIguais: [], falhas: [] } },
    { id: "b", criadoEm: "2026-11-20T12:00:00.000", origem: "2.1", destino: "1.2", direcao: "volta", proposta: true, usuario: "bia@x.com", usuarioNome: null, resultado: "parcial", motivo: null, alteracoes: "lixo", avisos: ["comentário falhou"], comentarioPublicado: false, assesments: { total: 2, atualizados: [], jaIguais: [], falhas: [{ id: 1, erro: "x" }, { id: 2, erro: "y" }] } },
    { id: "c", criadoEm: null, origem: null, destino: "-", direcao: "edicao", proposta: null, usuario: "cris@x.com", usuarioNome: "  ", resultado: "bloqueado", motivo: "Valores inválidos", alteracoes: null, avisos: null, comentarioPublicado: null, assesments: null },
  ]);
  assert.deepEqual(m.map((x) => x.id), ["b", "a", "c"]);
  assert.equal(m[0].quando, "2026-11-20T12:00:00.000Z");
  assert.equal(m[0].quem, "bia@x.com");
  assert.equal(m[1].quem, "Ana");
  assert.deepEqual(m[0].alteracoes, []);
  assert.deepEqual(m[0].avisos, ["comentário falhou"]);
  assert.equal(m[0].assesmentsFalhas, 2);
  assert.equal(m[0].proposta, true);
  assert.equal(m[1].alteracoes[0].rotulo, "Etapa");
  assert.equal(m[2].quem, "cris@x.com");
  assert.equal(m[2].quando, null);
  assert.equal(m[2].proposta, false);
  assert.deepEqual(montarMovimentos([]), []);
});

test("instanteDaRevisao: usa o ChangedDate da revisão; revisedDate de 'até quando valeu' e o marcador 9999 não servem", () => {
  // dados reais do PBI 46766: revisedDate = quando a revisão SEGUINTE a substituiu
  assert.equal(instanteDaRevisao({ fields: { "System.ChangedDate": { newValue: "2026-11-20T23:58:56.107Z" } }, revisedDate: "2026-11-20T23:59:10.68Z" }), "2026-11-20T23:58:56.107Z");
  // última revisão: revisedDate é o marcador
  assert.equal(instanteDaRevisao({ fields: { "System.ChangedDate": { newValue: "2026-11-21T00:03:34.463Z" } }, revisedDate: "9999-01-01T00:00:00Z" }), "2026-11-21T00:03:34.463Z");
  // sem ChangedDate: cai no revisedDate, menos se for o marcador
  assert.equal(instanteDaRevisao({ revisedDate: "2026-10-02T20:21:10.613Z" }), "2026-10-02T20:21:10.613Z");
  assert.equal(instanteDaRevisao({ revisedDate: "9999-01-01T00:00:00Z" }), null);
  assert.equal(instanteDaRevisao({ fields: { "System.ChangedDate": { newValue: "lixo" } } }), null);
  assert.equal(instanteDaRevisao({}), null);
});

test("montarHistorico e montarAnexos usam o horário em que a revisão foi feita", () => {
  const ups: UpdateAzure[] = [
    { rev: 1, revisedDate: "2026-10-02T20:22:00Z", revisedBy: { displayName: "A" }, fields: { "System.ChangedDate": { newValue: "2026-10-02T20:21:10Z" }, "Custom.Etapa": { newValue: "Backlog" } }, relations: { added: [{ rel: "AttachedFile", url: "https://x/_apis/wit/attachments/abc", attributes: { name: "a.pdf" } }] } },
    { rev: 2, revisedDate: "9999-01-01T00:00:00Z", revisedBy: { displayName: "B" }, fields: { "System.ChangedDate": { newValue: "2026-11-20T18:00:00Z" }, "Custom.Etapa": { oldValue: "Backlog", newValue: "Comitê" } } },
  ];
  const h = montarHistorico(ups);
  assert.deepEqual(h.map((e) => e.quando), ["2026-11-20T18:00:00Z", "2026-10-02T20:21:10Z"]);
  assert.equal(montarAnexos([{ rel: "AttachedFile", url: "https://x/_apis/wit/attachments/abc", attributes: { name: "a.pdf" } }], ups)[0].quando, "2026-10-02T20:21:10Z");
});

test("bordas do histórico e dos anexos: valor sem displayName, anexo sem nome, revisão sem número nem autor", () => {
  const h = montarHistorico([
    { fields: { "System.AssignedTo": { oldValue: {}, newValue: { displayName: "Ana" } } } },
    { rev: 3, revisedBy: { displayName: "B" }, relations: { removed: [{ rel: "AttachedFile" }] } },
  ]);
  assert.deepEqual(h.map((e) => e.rev), [3, 0]);
  assert.deepEqual(h[0].mudancas, [{ campo: "Anexo", de: "(sem nome)", para: null }]);
  assert.deepEqual(h[1].mudancas, [{ campo: "Responsável", de: null, para: "Ana" }]);
  assert.equal(h[1].usuario, "(desconhecido)");
  const a = montarAnexos([{ rel: "AttachedFile", url: "https://x/_apis/wit/attachments/zzz" }]);
  assert.equal(a[0].nome, "(sem nome)");
  assert.equal(a[0].quando, null);
});

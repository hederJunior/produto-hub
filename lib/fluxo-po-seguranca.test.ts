// Requisitos de segurança (1.2): formulário, bloco na Description, leitura de volta e validação. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERGUNTAS_SEGURANCA,
  aplicarBlocoNaDescricao,
  alteracaoDaSeguranca,
  formularioVazio,
  lerBaseDaTela,
  lerSegurancaDaDescricao,
  mesmoFormulario,
  montarBlocoSeguranca,
  validarRespostas,
  type ItemSeguranca,
} from "./fluxo-po-seguranca";

const preenchido = (): ItemSeguranca[] =>
  PERGUNTAS_SEGURANCA.map((p, i) => ({ id: p.id, resposta: (["sim", "nao", "na"] as const)[i % 3], observacao: i === 0 ? "Conforme <necessidade> & tempo,\ncom liberação \"autorizada\"" : "" }));

test("o formulário tem as 7 perguntas do documento, com ids únicos", () => {
  assert.equal(PERGUNTAS_SEGURANCA.length, 7);
  assert.equal(new Set(PERGUNTAS_SEGURANCA.map((p) => p.id)).size, 7);
  assert.match(PERGUNTAS_SEGURANCA[2].texto, /^A KMM terá acesso direto a senha da base de dados/);
});

test("montar e ler de volta: respostas e observações idênticas (com caracteres especiais e quebra de linha)", () => {
  const itens = preenchido();
  const lido = lerSegurancaDaDescricao(montarBlocoSeguranca(itens, { quem: "Ana <PO>", quando: new Date("2026-11-25T15:30:00Z") }));
  assert.deepEqual(lido, itens);
});

test("o bloco traz título, tabela, o rótulo das respostas e a linha de registro em horário de Brasília", () => {
  const html = montarBlocoSeguranca(preenchido(), { quem: "Ana", quando: new Date("2026-11-25T15:30:00Z") });
  assert.match(html, /<div id="kmm-requisitos-seguranca">/);
  assert.match(html, /<h3>Checklist de segurança e privacidade de dados<\/h3>/);
  assert.match(html, />SIM<\/td>/);
  assert.match(html, />NÃO<\/td>/);
  assert.match(html, />NÃO APLICÁVEL<\/td>/);
  assert.match(html, /Registrado por Ana em 25\/11\/2026 12:30/);
  assert.match(html, /Conforme &lt;necessidade&gt; &amp; tempo,<br>com/);
});

test("sem bloco na Description: ler devolve null", () => {
  assert.equal(lerSegurancaDaDescricao("<p>Chamado do cliente</p>"), null);
  assert.equal(lerSegurancaDaDescricao(""), null);
  assert.equal(lerSegurancaDaDescricao(null), null);
});

test("acrescenta no fim sem mexer no resto (texto, imagem, estilo)", () => {
  const original = '<div style="color:red">Chamado <img src="https://x/y.png"> do cliente</div>';
  const bloco = montarBlocoSeguranca(preenchido());
  const nova = aplicarBlocoNaDescricao(original, bloco);
  assert.ok(nova.startsWith(original));
  assert.ok(nova.endsWith(bloco));
});

test("Description vazia: fica só o bloco", () => {
  const bloco = montarBlocoSeguranca(preenchido());
  assert.equal(aplicarBlocoNaDescricao("", bloco), bloco);
  assert.equal(aplicarBlocoNaDescricao("<div><br></div>", bloco), bloco);
  assert.equal(aplicarBlocoNaDescricao(null, bloco), bloco);
});

test("registrar de novo SUBSTITUI o bloco no mesmo lugar, e o resto fica igual", () => {
  const v1 = montarBlocoSeguranca(preenchido());
  const outro = preenchido().map((i) => ({ ...i, resposta: "sim" as const, observacao: "novo" }));
  const v2 = montarBlocoSeguranca(outro);
  const descricao = `<p>Antes</p>${v1}<p>Depois (alguém escreveu abaixo)</p>`;
  const nova = aplicarBlocoNaDescricao(descricao, v2);
  assert.equal(nova, `<p>Antes</p>${v2}<p>Depois (alguém escreveu abaixo)</p>`);
  assert.equal((nova.match(/kmm-requisitos-seguranca/g) ?? []).length, 1);
  assert.deepEqual(lerSegurancaDaDescricao(nova), outro);
});

test("se o Azure retirar o id do bloco, ele ainda é reconhecido (título + tabela) e substituído", () => {
  const semId = montarBlocoSeguranca(preenchido()).replace(' id="kmm-requisitos-seguranca"', "");
  const descricao = `<p>Chamado</p>${semId}`;
  assert.deepEqual(lerSegurancaDaDescricao(descricao), preenchido());
  const nova = aplicarBlocoNaDescricao(descricao, montarBlocoSeguranca(formularioVazio()));
  assert.equal((nova.match(/<table/g) ?? []).length, 1);
  assert.ok(nova.startsWith("<p>Chamado</p>"));
});

test("validarRespostas: exige as 7 respostas e limita a observação", () => {
  assert.equal(validarRespostas("x").erro, "Envie as respostas do formulário.");
  const incompleto = preenchido().slice(0, 5);
  assert.match(validarRespostas(incompleto).erro ?? "", /falta: 6, 7/);
  const semResposta = preenchido().map((i, idx) => (idx === 2 ? { ...i, resposta: null } : i));
  assert.match(validarRespostas(semResposta).erro ?? "", /falta: 3/);
  const invalida = preenchido().map((i, idx) => (idx === 0 ? { ...i, resposta: "talvez" } : i));
  assert.match(validarRespostas(invalida).erro ?? "", /falta: 1/);
  const longa = preenchido().map((i, idx) => (idx === 3 ? { ...i, observacao: "x".repeat(1001) } : i));
  assert.match(validarRespostas(longa).erro ?? "", /pergunta 4 passou de 1000/);
  const ok = validarRespostas(preenchido().reverse().map((i) => ({ ...i, observacao: `  ${i.observacao}  ` })));
  assert.equal(ok.erro, undefined);
  assert.deepEqual(ok.itens?.map((i) => i.id), PERGUNTAS_SEGURANCA.map((p) => p.id), "devolve na ordem do formulário");
});

test("mesmoFormulario: ausente e em branco são iguais; qualquer mudança difere", () => {
  assert.equal(mesmoFormulario(null, formularioVazio()), true);
  assert.equal(mesmoFormulario(preenchido(), preenchido()), true);
  const mudou = preenchido();
  mudou[4].resposta = "na";
  assert.equal(mesmoFormulario(preenchido(), mudou), false);
  assert.equal(mesmoFormulario(null, preenchido()), false);
});

test("lerBaseDaTela é tolerante; alteracaoDaSeguranca resume sem expor as observações", () => {
  assert.equal(lerBaseDaTela(null), null);
  assert.equal(lerBaseDaTela(undefined), null);
  assert.deepEqual(lerBaseDaTela([{ id: "senha-base", resposta: "sim", observacao: "a" }])?.find((i) => i.id === "senha-base"), { id: "senha-base", resposta: "sim", observacao: "a" });
  const a = alteracaoDaSeguranca(null, preenchido());
  assert.equal(a.de, "não preenchido");
  assert.equal(a.para, "Sim 3, Não 2, N/A 2");
  assert.ok(!JSON.stringify(a).includes("necessidade"));
});

test("formato que o Azure realmente devolve (id sem aspas, espaço antes de fechar as tags): reconhece e substitui sem deixar div solto", () => {
  const azure = montarBlocoSeguranca(preenchido())
    .replace('id="kmm-requisitos-seguranca"', "id=kmm-requisitos-seguranca")
    .replace(/<\/(td|h3|p)>/g, " </$1>")
    .replace("</div>", " </div>");
  const descricao = `<p>Chamado</p><br>${azure}`;
  assert.deepEqual(lerSegurancaDaDescricao(descricao), preenchido());
  const nova = aplicarBlocoNaDescricao(descricao, montarBlocoSeguranca(formularioVazio()));
  assert.equal((nova.match(/<div/gi) ?? []).length, 1, "um único div (o do bloco novo)");
  assert.equal((nova.match(/<\/div>/gi) ?? []).length, 1);
  assert.equal((nova.match(/<table/gi) ?? []).length, 1);
  assert.ok(nova.startsWith("<p>Chamado</p><br>"));
});

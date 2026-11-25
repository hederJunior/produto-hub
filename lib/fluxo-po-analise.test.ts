// Testes da "Análise" (Description do Assesment) na etapa 2.1. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITE_ANALISE, alteracaoDaAnalise, analisarPerdas, htmlSemTexto, prepararAnalise } from "./fluxo-po-analise";

test("analisarPerdas: conta imagens e detecta estilo inline ou fonte", () => {
  assert.deepEqual(analisarPerdas('<div>Texto <img src="a.png"> e <IMG src="b.png"></div>'), { imagens: 2, estilos: false });
  assert.deepEqual(analisarPerdas('<div style="color:red">x</div>'), { imagens: 0, estilos: true });
  assert.deepEqual(analisarPerdas('<font color="red">x</font>'), { imagens: 0, estilos: true });
  assert.deepEqual(analisarPerdas('<div style="">x</div>'), { imagens: 0, estilos: false });
  assert.deepEqual(analisarPerdas("<p>simples</p><ul><li>a</li></ul>"), { imagens: 0, estilos: false });
  assert.deepEqual(analisarPerdas(null), { imagens: 0, estilos: false });
});

test("htmlSemTexto", () => {
  assert.equal(htmlSemTexto("<div><br></div>&nbsp; "), true);
  assert.equal(htmlSemTexto("<p>a</p>"), false);
});

test("prepararAnalise: aceita texto simples e lista, tirando o que é perigoso", () => {
  const r = prepararAnalise('<div onclick="x()">Escopo <b>fechado</b></div><script>alert(1)</script><ul><li>item</li></ul>');
  assert.equal(r.erro, undefined);
  assert.equal(r.html, "<div>Escopo <b>fechado</b></div><ul><li>item</li></ul>");
});

test("prepararAnalise: recusa vazio, não-texto e texto grande demais", () => {
  assert.match(prepararAnalise("<div><br></div>").erro ?? "", /vazio/);
  assert.match(prepararAnalise(null).erro ?? "", /obrigatório/);
  assert.match(prepararAnalise(123).erro ?? "", /obrigatório/);
  assert.match(prepararAnalise("a".repeat(LIMITE_ANALISE + 1)).erro ?? "", /tamanho máximo/);
  assert.equal(prepararAnalise("a".repeat(LIMITE_ANALISE)).erro, undefined);
});

test("alteracaoDaAnalise: guarda só os tamanhos", () => {
  const a = alteracaoDaAnalise(46767, "<p>abc</p>", "<p>abcdef</p>");
  assert.deepEqual(a, { campo: "System.Description", rotulo: "Análise (Assesment 46767)", de: "3 caracteres", para: "6 caracteres" });
});

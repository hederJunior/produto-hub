// Testes do sanitizador de HTML. Rodar: npm run test:fluxo-po
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizarHtml } from "./html-seguro";

const h = (s: string) => sanitizarHtml(s).html;

test("mantém formatação básica", () => {
  assert.equal(h("<p>Olá <strong>mundo</strong><br>fim</p>"), "<p>Olá <strong>mundo</strong><br>fim</p>");
  assert.equal(h("<ul><li>a</li><li>b</li></ul>"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(h("<table><tr><td colspan='2'>x</td></tr></table>"), '<table><tr><td colspan="2">x</td></tr></table>');
});

test("remove script, style, iframe e seu conteúdo", () => {
  assert.equal(h("a<script>alert(1)</script>b"), "ab");
  assert.equal(h("a<style>body{display:none}</style>b"), "ab");
  assert.equal(h('a<iframe src="https://x"></iframe>b'), "ab");
  assert.equal(h("a<script>alert(1)"), "a"); // sem fechamento: descarta até o fim
  assert.equal(h("<SCRIPT >x</SCRIPT>ok"), "ok");
});

test("ofuscação aninhada de script não passa", () => {
  const out = h("<scr<script>x</script>ipt>alert(1)</scr<script>x</script>ipt>");
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /alert\(1\)/);
});

test("descarta atributos perigosos (eventos, style, class)", () => {
  assert.equal(h('<p onclick="x()" style="color:red" class="c" id="i">t</p>'), "<p>t</p>");
  assert.equal(h('<span onmouseover="alert(1)">t</span>'), "<span>t</span>");
});

test("links: só http/https/mailto, com rel seguro; javascript: e data: viram texto", () => {
  assert.equal(h('<a href="https://exemplo.com/a?b=1&c=2">l</a>'), '<a href="https://exemplo.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">l</a>');
  assert.equal(h('<a href="mailto:a@b.com">m</a>'), '<a href="mailto:a@b.com" target="_blank" rel="noopener noreferrer">m</a>');
  assert.equal(h('<a href="javascript:alert(1)">x</a>'), "<span>x</span>");
  assert.equal(h('<a href=" JaVa\tScRiPt:alert(1)">x</a>'), "<span>x</span>");
  assert.equal(h('<a href="data:text/html,<script>alert(1)</script>">x</a>'), "<span>x</span>");
  assert.equal(h('<a href="/relativo">x</a>'), "<span>x</span>");
  // aspas no valor não escapam do atributo
  const out = h('<a href="https://x.com/&quot; onmouseover=&quot;alert(1)">x</a>');
  assert.doesNotMatch(out, / onmouseover=/);
});

test("imagens viram [imagem]", () => {
  assert.equal(h('a<img src="https://dev.azure.com/x.png" onerror="alert(1)">b'), "a<em>[imagem]</em>b");
});

test("texto é escapado; entidades válidas são preservadas", () => {
  assert.equal(h("1 < 2 && 3 > 2"), "1 &lt; 2 &amp;&amp; 3 &gt; 2");
  assert.equal(h("a&nbsp;b &amp; c &#39;d&#39;"), "a&nbsp;b &amp; c &#39;d&#39;");
  assert.equal(h("&lt;script&gt;alert(1)&lt;/script&gt;"), "&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("tags desconhecidas somem, o texto permanece; comentários HTML somem", () => {
  assert.equal(h("<font color='red'>t</font><!-- segredo -->x"), "tx");
  assert.equal(h("<o:p>t</o:p>"), "t");
});

test("fecha tags abertas e ignora fechamentos sobrando", () => {
  assert.equal(h("<p><b>a"), "<p><b>a</b></p>");
  assert.equal(h("a</div></p>b"), "ab");
  assert.equal(h("<b><i>x</b>y"), "<b><i>x</i></b>y");
});

test("entrada vazia/nula e truncamento", () => {
  assert.deepEqual(sanitizarHtml(null), { html: "", truncado: false });
  assert.deepEqual(sanitizarHtml(undefined), { html: "", truncado: false });
  const r = sanitizarHtml("<p>" + "a".repeat(50) + "</p>", 10);
  assert.equal(r.truncado, true);
  assert.ok(r.html.length < 40);
});

test("ataques clássicos de XSS não geram tag executável nem atributo de evento", () => {
  const ataques = [
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<body onload=alert(1)>',
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    '<div style="background:url(javascript:alert(1))">x</div>',
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    '"><script>alert(1)</script>',
    '<p onclick=alert(1)>x</p>',
  ];
  for (const a of ataques) {
    const out = h(a);
    assert.doesNotMatch(out, /<script|<svg|<iframe|\son\w+=|javascript:/i, `${a} → ${out}`);
  }
});

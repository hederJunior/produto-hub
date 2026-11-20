/**
 * Sanitizador de HTML por LISTA DE PERMISSÃO, sem dependências (o projeto não tem DOMPurify/sanitize-html).
 * Usado para devolver ao navegador o HTML que vem do Azure DevOps (descrição e comentários do PBI), que pode conter
 * qualquer coisa colada por quem abriu o chamado.
 *
 * Seguro por construção: o resultado é montado só com tags permitidas, SEM atributos além dos explicitamente listados
 * (href de http/https/mailto; colspan/rowspan numéricos) e com todo texto escapado. Nada do HTML de entrada é copiado como
 * veio. Imagens viram "[imagem]" (as do Azure exigem login no domínio dele e não carregariam aqui).
 */

const TAGS_PERMITIDAS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "ul", "ol", "li", "blockquote", "pre", "code", "hr",
  "div", "span", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td", "a",
]);
const TAGS_VAZIAS = new Set(["br", "hr"]);
/** Tags cujo CONTEÚDO também é descartado (não só a tag). */
const DESCARTAR_COM_CONTEUDO = /<(script|style|iframe|object|embed|noscript|template|svg|math|textarea)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;

export type HtmlSeguro = { html: string; truncado: boolean };

/** Tamanho máximo do HTML de entrada processado (o excedente é cortado e `truncado` fica true). */
export const LIMITE_HTML = 200_000;

function escaparTexto(t: string): string {
  return t.replace(/&(?!(?:#\d{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});)/g, "&amp;").replace(/>/g, "&gt;");
}

function escaparAtributo(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Valor do atributo `nome` dentro do texto de atributos de uma tag (aspas duplas, simples ou sem aspas). */
function valorDoAtributo(atributos: string, nome: string): string | null {
  const m = new RegExp(`(?:^|\\s)${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(atributos);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/** href só se for http, https ou mailto (sem javascript:, data:, vbscript:, relativos nem esquemas disfarçados). */
function hrefSeguro(bruto: string | null): string | null {
  if (bruto === null) return null;
  const limpo = bruto.replace(/[\u0000- \u007f-\u009f]/g, "");
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(limpo) ? limpo : null;
}

function atributosPermitidos(tag: string, atributos: string): string {
  if (tag === "a") {
    const href = hrefSeguro(valorDoAtributo(atributos, "href"));
    return href ? ` href="${escaparAtributo(href)}" target="_blank" rel="noopener noreferrer"` : "";
  }
  if (tag === "td" || tag === "th") {
    let out = "";
    for (const nome of ["colspan", "rowspan"]) {
      const v = valorDoAtributo(atributos, nome);
      if (v !== null && /^\d{1,2}$/.test(v.trim()) && Number(v) >= 1) out += ` ${nome}="${Number(v)}"`;
    }
    return out;
  }
  return "";
}

/** HTML de entrada → HTML seguro (só tags permitidas, atributos mínimos, texto escapado). */
export function sanitizarHtml(entrada: string | null | undefined, limite: number = LIMITE_HTML): HtmlSeguro {
  let fonte = String(entrada ?? "");
  const truncado = fonte.length > limite;
  if (truncado) fonte = fonte.slice(0, limite);

  // Remove blocos perigosos até estabilizar (um bloco removido pode revelar outro: "<scr<script></script>ipt>").
  for (let i = 0; i < 6; i++) {
    const antes = fonte;
    fonte = fonte.replace(DESCARTAR_COM_CONTEUDO, "");
    if (fonte === antes) break;
  }

  const saida: string[] = [];
  const pilha: string[] = []; // tags JÁ emitidas e ainda abertas
  const fechar = (nome: string) => {
    const pos = pilha.lastIndexOf(nome);
    if (pos === -1) return;
    while (pilha.length > pos) saida.push(`</${pilha.pop()}>`);
  };

  const tokens = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|<|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = tokens.exec(fonte)) !== null) {
    const [token, barra, nomeBruto, atributos] = m;
    if (token.startsWith("<!--")) continue;
    if (token === "<") {
      saida.push("&lt;");
      continue;
    }
    if (nomeBruto === undefined) {
      saida.push(escaparTexto(token));
      continue;
    }
    const nome = nomeBruto.toLowerCase();
    if (nome === "img") {
      if (!barra) saida.push("<em>[imagem]</em>");
      continue;
    }
    if (!TAGS_PERMITIDAS.has(nome)) continue; // tag desconhecida: some a tag, o texto de dentro permanece (escapado)
    if (barra) {
      if (!TAGS_VAZIAS.has(nome)) fechar(nome === "a" && !pilha.includes("a") ? "span" : nome);
      continue;
    }
    if (TAGS_VAZIAS.has(nome)) {
      saida.push(`<${nome}>`);
      continue;
    }
    const attrs = atributosPermitidos(nome, atributos);
    const emitida = nome === "a" && !attrs ? "span" : nome; // link sem URL segura vira texto comum
    saida.push(`<${emitida}${attrs}>`);
    pilha.push(emitida);
  }
  while (pilha.length) saida.push(`</${pilha.pop()}>`);
  return { html: saida.join(""), truncado };
}

/**
 * Fluxo do PO > detalhe da etapa 1.2 > "Requisitos de segurança e privacidade de dados" (pedido por Heder em 2026-11-25): formulário
 * de 7 perguntas (Sim / Não / Não aplicável + Observação) que o PO preenche na 1.2 e que é REGISTRADO NO PBI como um complemento da
 * Description. Só regras PURAS (sem fetch); leitura e gravação no Azure DevOps estão em lib/fluxo-po-seguranca-servidor.ts.
 *
 * O complemento é um bloco HTML delimitado (`<div id="kmm-requisitos-seguranca">`) no FIM da Description. Registrar de novo SUBSTITUI
 * esse bloco no lugar; o resto da Description (texto, imagens, estilos do chamado) é preservado exatamente como está no Azure, porque
 * a gravação é feita sobre o HTML bruto e nunca sobre a versão sanitizada que a tela mostra. Se o Azure retirar o `id` ao salvar pela
 * interface dele, o bloco ainda é reconhecido pelo título + tabela.
 */
import type { Alteracao } from "./fluxo-po";

export type RespostaSeguranca = "sim" | "nao" | "na";

export const ROTULO_RESPOSTA: Record<RespostaSeguranca, string> = { sim: "SIM", nao: "NÃO", na: "NÃO APLICÁVEL" };

/** Texto das perguntas, igual ao formulário oficial enviado pelo Heder (mantido como está, inclusive a redação). */
export const PERGUNTAS_SEGURANCA = [
  { id: "liberacao-acessos", texto: "Será utilizado a arquitetura do software KMM para a liberação de acessos? Em caso negativo, quem será o responsável pela liberação de acesso as funções do sistema?" },
  {
    id: "permissoes-acessos",
    texto:
      "Será utilizado a arquitetura do software KMM para a permissões de acessos? Em caso negativo, como será feito o processo de permissões para usuários, os seguintes itens devem constar: onde será registrado, por quem, quem aprova, quem executa a liberação?",
  },
  { id: "senha-base", texto: "A KMM terá acesso direto a senha da base de dados do sistema em produção? Se sim indicar quem e o período." },
  {
    id: "transferencia-terceiros",
    texto: "O sistema tem alguma transferência de informações com terceiros (Ex: integrações com outros sistemas, governo etc.)? Se tiver, cite para quem e em qual periodicidade e como essa transferência ocorre.",
  },
  { id: "politica-privacidade", texto: "O sistema possui uma política de privacidade própria? Se sim, analisar se está em conformidade com a do cliente?" },
  { id: "dados-pessoais", texto: "Existem dado(s) pessoal (is), se sim qual (is)?" },
  { id: "protecao-dados", texto: "Como os dados pessoais são protegidos (ex: banco separado, criptografia, rastreabilidade de acessos aos dados e modificação etc.)?" },
] as const;

export type IdPergunta = (typeof PERGUNTAS_SEGURANCA)[number]["id"];

export type ItemSeguranca = { id: IdPergunta; resposta: RespostaSeguranca | null; observacao: string };

export const TITULO_FORMULARIO = "Checklist de segurança e privacidade de dados";
export const CABECALHO_REQUISITOS = "Requisitos para softwares/projetos desenvolvidos pela KMM";
export const ID_BLOCO = "kmm-requisitos-seguranca";
/** Tamanho máximo da observação de cada pergunta. */
export const LIMITE_OBSERVACAO = 1000;

/** Formulário em branco (nenhuma resposta). */
export function formularioVazio(): ItemSeguranca[] {
  return PERGUNTAS_SEGURANCA.map((p) => ({ id: p.id, resposta: null, observacao: "" }));
}

// ---------------------------------------------------------------------------------------------------------------- HTML

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const compacto = (s: string) => semAcento(s).replace(/\s+/g, " ").trim();

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function desescapar(t: string): string {
  return t
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d{1,6});/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, "&");
}

/** Texto visível de um trecho de HTML (`<br>` e fim de parágrafo viram quebra de linha). */
function textoDe(html: string): string {
  return desescapar(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div)>/gi, "\n").replace(/<[^>]*>/g, ""))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const ESTILO_CELULA = "border:1px solid #999;padding:4px 6px;vertical-align:top";

/** Data e hora amigáveis (horário de Brasília) para a linha "registrado por…". */
export function dataHoraBrasilia(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(data).replace(",", "");
}

/** O bloco HTML que vai no fim da Description do PBI. `quem`/`quando` entram numa linha de registro acima da tabela. */
export function montarBlocoSeguranca(itens: ItemSeguranca[], registro?: { quem: string; quando: Date }): string {
  const linhas = PERGUNTAS_SEGURANCA.map((p) => {
    const item = itens.find((i) => i.id === p.id);
    const resposta = item?.resposta ? ROTULO_RESPOSTA[item.resposta] : "";
    const obs = escapar(item?.observacao ?? "").replace(/\n/g, "<br>");
    return `<tr><td style="${ESTILO_CELULA}">${escapar(p.texto)}</td><td style="${ESTILO_CELULA};text-align:center">${resposta}</td><td style="${ESTILO_CELULA}">${obs}</td></tr>`;
  }).join("");
  const linhaRegistro = registro ? `<p><i>Registrado por ${escapar(registro.quem)} em ${dataHoraBrasilia(registro.quando)} (Produto Hub, Fluxo do PO, etapa 1.2).</i></p>` : "";
  return (
    `<div id="${ID_BLOCO}"><h3>${escapar(TITULO_FORMULARIO)}</h3>${linhaRegistro}` +
    `<table style="border-collapse:collapse;width:100%"><thead><tr><th style="${ESTILO_CELULA}">${escapar(CABECALHO_REQUISITOS)}</th><th style="${ESTILO_CELULA}">Sim/Não/ Não aplicável</th><th style="${ESTILO_CELULA}">Observação</th></tr></thead>` +
    `<tbody>${linhas}</tbody></table></div>`
  );
}

type Posicao = { inicio: number; fim: number };

/** Onde está o bloco na Description bruta: pelo `id`; se o Azure o tiver retirado, pelo título seguido da tabela. */
function acharBloco(descricao: string): Posicao | null {
  // O Azure grava o atributo sem aspas (`id=kmm-requisitos-seguranca`) e põe espaços antes de fechar as tags; as aspas são opcionais aqui.
  const porId = new RegExp(`<div\\b[^>]*\\bid\\s*=\\s*["']?${ID_BLOCO}["']?(?=[\\s>/])[^>]*>[\\s\\S]*?</div>`, "i").exec(descricao);
  if (porId) return { inicio: porId.index, fim: porId.index + porId[0].length };
  const titulo = TITULO_FORMULARIO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const porTitulo = new RegExp(`<h[1-6]\\b[^>]*>\\s*${titulo}\\s*</h[1-6]>[\\s\\S]*?</table>`, "i").exec(descricao);
  return porTitulo ? { inicio: porTitulo.index, fim: porTitulo.index + porTitulo[0].length } : null;
}

/** O formulário já registrado na Description bruta (null = ainda não há). Perguntas que não casarem ficam sem resposta. */
export function lerSegurancaDaDescricao(descricao: string | null | undefined): ItemSeguranca[] | null {
  const bruto = String(descricao ?? "");
  const pos = acharBloco(bruto);
  if (!pos) return null;
  const itens = formularioVazio();
  for (const tr of bruto.slice(pos.inicio, pos.fim).match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
    const celulas = (tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? []).map((c) => textoDe(c.replace(/^<td\b[^>]*>/i, "").replace(/<\/td>$/i, "")));
    if (celulas.length < 2) continue;
    const pergunta = PERGUNTAS_SEGURANCA.find((p) => compacto(p.texto) === compacto(celulas[0]));
    if (!pergunta) continue;
    const r = compacto(celulas[1]);
    const item = itens.find((i) => i.id === pergunta.id)!;
    item.resposta = r === "sim" ? "sim" : r === "nao" ? "nao" : r === "nao aplicavel" ? "na" : null;
    item.observacao = celulas[2] ?? "";
  }
  return itens;
}

/** Coloca o bloco na Description: substitui o que já existe (no mesmo lugar) ou acrescenta no fim. O resto fica byte a byte igual. */
export function aplicarBlocoNaDescricao(descricao: string | null | undefined, bloco: string): string {
  const bruto = String(descricao ?? "");
  const pos = acharBloco(bruto);
  if (pos) return bruto.slice(0, pos.inicio) + bloco + bruto.slice(pos.fim);
  const semTexto = bruto.replace(/<[^>]*>|&nbsp;|\s/g, "") === "";
  return semTexto ? bloco : `${bruto}<br>${bloco}`;
}

// ---------------------------------------------------------------------------------------------------------------- Entrada

export type EntradaSeguranca = { id?: unknown; resposta?: unknown; observacao?: unknown };

/**
 * Valida o que a tela enviou: as 7 perguntas, cada uma com resposta (sim/nao/na) e observação opcional (até LIMITE_OBSERVACAO).
 * Devolve os itens na ordem do formulário ou a mensagem de erro (422).
 */
export function validarRespostas(entrada: unknown): { itens: ItemSeguranca[]; erro?: undefined } | { erro: string; itens?: undefined } {
  if (!Array.isArray(entrada)) return { erro: "Envie as respostas do formulário." };
  const itens: ItemSeguranca[] = [];
  const faltando: number[] = [];
  PERGUNTAS_SEGURANCA.forEach((p, idx) => {
    const e = (entrada as EntradaSeguranca[]).find((x) => x && typeof x === "object" && x.id === p.id);
    const r = e?.resposta;
    if (r !== "sim" && r !== "nao" && r !== "na") {
      faltando.push(idx + 1);
      return;
    }
    const obs = typeof e?.observacao === "string" ? e.observacao.replace(/\r/g, "").trim() : "";
    itens.push({ id: p.id, resposta: r, observacao: obs });
  });
  if (faltando.length) return { erro: `Responda todas as perguntas antes de registrar (falta: ${faltando.join(", ")}).` };
  const longa = itens.findIndex((i) => i.observacao.length > LIMITE_OBSERVACAO);
  if (longa >= 0) return { erro: `A observação da pergunta ${longa + 1} passou de ${LIMITE_OBSERVACAO} caracteres.` };
  return { itens };
}

/** Os dois formulários têm as mesmas respostas e observações? (trava de edição simultânea) */
export function mesmoFormulario(a: ItemSeguranca[] | null, b: ItemSeguranca[] | null): boolean {
  const norm = (x: ItemSeguranca[] | null) => JSON.stringify((x ?? formularioVazio()).map((i) => [i.id, i.resposta, i.observacao.trim()]));
  return norm(a) === norm(b);
}

/** Linha do log: guarda o resumo (quantas Sim/Não/N.A.), não o texto das observações. */
export function alteracaoDaSeguranca(antes: ItemSeguranca[] | null, depois: ItemSeguranca[]): Alteracao {
  const resumo = (x: ItemSeguranca[] | null) => {
    if (!x) return "não preenchido";
    const c = (r: RespostaSeguranca) => x.filter((i) => i.resposta === r).length;
    return `Sim ${c("sim")}, Não ${c("nao")}, N/A ${c("na")}`;
  };
  return { campo: "System.Description", rotulo: "Requisitos de segurança (complemento da Description)", de: resumo(antes), para: resumo(depois) };
}

/** Lê com tolerância o formulário "de referência" que a tela mandou de volta (respostas ausentes viram null). null/ausente = não havia. */
export function lerBaseDaTela(entrada: unknown): ItemSeguranca[] | null {
  if (!Array.isArray(entrada)) return null;
  return PERGUNTAS_SEGURANCA.map((p) => {
    const e = (entrada as EntradaSeguranca[]).find((x) => x && typeof x === "object" && x.id === p.id);
    const r = e?.resposta;
    return { id: p.id, resposta: r === "sim" || r === "nao" || r === "na" ? r : null, observacao: typeof e?.observacao === "string" ? e.observacao : "" };
  });
}

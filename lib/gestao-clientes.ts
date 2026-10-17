/**
 * Tela "Gestão de clientes" (pedido por Heder em 2026-10-17): lista de PBIs do Azure DevOps nos
 * status do board abaixo, no formato da planilha de acompanhamento (Chamado, Tarefa, PBI, Status,
 * Etapa, PO, Esteira, Observação) + 3 indicadores. Este módulo só tem tipos e regras PURAS (sem
 * fetch) — pode ser importado tanto pela página (client) quanto pelo servidor.
 */
import { CLIENTE_EXCLUIDO_VIABILIDADE } from "./demandas-agregacao";

/** Status do board que entram na tela (nomes como aparecem no Azure — ver docs/decisoes-e-conhecimento.md). */
export const ESTADOS_GESTAO_CLIENTES = ["Backlog", "Orçamento", "Execução", "Teste Aceite Usuário", "Aguardando Deploy"] as const;

export type PbiGestaoCliente = {
  id: number;
  /** TeamProject do Azure (KMM4/KMM5) — também define o produto. */
  projeto: string;
  /** Campo "ID Externo" do PBI (nº do chamado) — "" se vazio. */
  idExterno: string;
  titulo: string;
  state: string;
  etapa: string;
  po: string;
  areaPath: string;
  cliente: string;
  createdDate: string;
  dataAberturaProduto: string | null;
  /** Campo "Classificação" do PBI ("" se vazio). */
  classificacao: string;
  /** Custom "Data Comitê" (data pura, ex. "2026-10-26T00:00:00Z") ou null. */
  dataComite: string | null;
  /** Effort do próprio PBI (Microsoft.VSTS.Scheduling.Effort), em horas — null se vazio. */
  effort: number | null;
  /** System.CommentCount — usado pra só buscar comentário dos PBIs que têm algum. */
  qtdComentarios: number;
};

export type UltimoComentario = { texto: string; autor: string; data: string };

const MS_POR_DIA = 86_400_000;

/** Minúsculo e sem acento — "Teste Aceite Usuário" e "teste aceite usuario" comparam iguais. */
export function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const ETAPAS_BACKLOG_DEMANDA = new Set(["backlog", "analise", "comite"]);

/** Indicador 1 — "Demandas em backlog": State = Backlog e Etapa em Backlog, Análise ou Comitê. */
export function emBacklogDemanda(p: Pick<PbiGestaoCliente, "state" | "etapa">): boolean {
  return norm(p.state) === "backlog" && ETAPAS_BACKLOG_DEMANDA.has(norm(p.etapa));
}

/** Indicador 2 — "Demandas em etapa comercial": State = Orçamento + State = Backlog com Etapa = Relacionamento Comercial. */
export function emEtapaComercial(p: Pick<PbiGestaoCliente, "state" | "etapa">): boolean {
  const s = norm(p.state);
  return s === "orcamento" || (s === "backlog" && norm(p.etapa) === "relacionamento comercial");
}

/**
 * Aging do PBI — MESMA regra do painel "Agging de Viabilidade" da tela principal
 * (lib/job-captura.ts → calcularAgingDias): só State = "Backlog"; hoje − Data Abertura Produto
 * (se vazia, Created Date), em dias inteiros (floor). null quando não se aplica.
 */
export function agingDiasPbi(p: Pick<PbiGestaoCliente, "state" | "dataAberturaProduto" | "createdDate">, agora = Date.now()): number | null {
  if (p.state !== "Backlog") return null;
  const baseBruta = p.dataAberturaProduto ?? p.createdDate;
  if (!baseBruta) return null;
  const base = new Date(String(baseBruta));
  if (Number.isNaN(base.getTime())) return null;
  return Math.floor((agora - base.getTime()) / MS_POR_DIA);
}

export type IndicadoresGestao = {
  demandasBacklog: number;
  demandasEtapaComercial: number;
  /** Média arredondada (dias) — null sem itens. */
  agingViabilidadeDias: number | null;
};

/**
 * Os 3 indicadores da tela, sobre os PBIs JÁ filtrados (produto + cliente). O Agging segue o
 * painel da tela principal (calcularAgingViabilidade): média do aging dos State = Backlog,
 * EXCLUINDO o cliente "KMM (INTERNO)", arredondada.
 */
export function calcularIndicadoresGestao(itens: PbiGestaoCliente[], agora = Date.now()): IndicadoresGestao {
  let soma = 0;
  let qtd = 0;
  for (const p of itens) {
    if (p.cliente === CLIENTE_EXCLUIDO_VIABILIDADE) continue;
    const aging = agingDiasPbi(p, agora);
    if (aging == null) continue;
    soma += aging;
    qtd += 1;
  }
  return {
    demandasBacklog: itens.filter(emBacklogDemanda).length,
    demandasEtapaComercial: itens.filter(emEtapaComercial).length,
    agingViabilidadeDias: qtd ? Math.round(soma / qtd) : null,
  };
}

/** Comentário do Azure vem em HTML (<div>, <br>, menções <a>...): vira texto simples numa linha. */
export function htmlParaTexto(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([aeiou])(acute|grave|circ|tilde);/gi, (_, v, t) => {
      const marca = ({ acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303" } as Record<string, string>)[t.toLowerCase()];
      return (v + marca).normalize("NFC");
    })
    .replace(/&ccedil;/gi, (m) => (m[1] === "C" ? "Ç" : "ç"))
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ordem de exibição (fluxo do board) — estado desconhecido vai pro fim. */
export function ordemDoStatus(state: string): number {
  const i = ESTADOS_GESTAO_CLIENTES.findIndex((e) => norm(e) === norm(state));
  return i === -1 ? 99 : i;
}

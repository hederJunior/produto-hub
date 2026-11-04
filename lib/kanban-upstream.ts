/**
 * Kanban do Upstream da carteira (Roadmap e entregas > Upstream, pedido por Heder em 2026-11-03):
 * PBIs das áreas Dedicada Maroni, Dedicada Transben, Projetos de Implantação, Serviços da Carteira e
 * SWAT distribuídos em 4 colunas pelas regras de State + Etapa (+ Tag). Só tipos e regras PURAS
 * (sem fetch) — usado pela tela e pela consulta ao Azure (lib/devops-client.ts).
 */
import { TAG_REFINAMENTO_TECH } from "./backlog";

export type ColunaKanban = "backlog" | "comite" | "analise" | "orcamento";

export type ItemKanban = {
  id: number;
  titulo: string;
  areaPath: string;
  coluna: ColunaKanban;
  cliente: string;
  po: string;
  /** System.CreatedDate (ISO). */
  createdDate: string;
  /** Data de Comitê (ISO, data pura) ou null. */
  dataComite: string | null;
  /** Microsoft.VSTS.Common.Priority (1–4) ou null. */
  prioridade: number | null;
};

/** Áreas do Kanban (filtro de seleção única). `nome` = último segmento do Area Path no Azure; SWAT é achada por regex. */
export const AREAS_KANBAN = [
  { rotulo: "Dedicada Maroni", nome: "TMS - Dedicada Maroni" },
  { rotulo: "Dedicada Transben", nome: "TMS - Dedicada Transben" },
  { rotulo: "Projetos de Implantação", nome: "TMS - Projetos de Implantacao" },
  { rotulo: "Serviços da Carteira", nome: "TMS - Serviços da Carteira" },
  { rotulo: "SWAT", nome: "SWAT" },
] as const;

export type AreaKanban = { valor: string; rotulo: string };

/** Minúsculo, sem acento e sem pontuação ("Relacionamento/Comercial" → "relacionamento comercial"). */
export function normKanban(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tags do Azure vêm numa string separada por ";". */
export function temTag(tags: string, tag: string): boolean {
  const alvo = normKanban(tag);
  return tags.split(";").some((t) => normKanban(t) === alvo);
}

/**
 * Coluna do PBI (null = não entra no Kanban):
 *  Backlog Produto = State Backlog + Etapa Backlog · Comitê = State Backlog + Etapa Comitê ·
 *  Em Análise Tech = State Backlog + Etapa Análise + tag "Pronto para refinamento tech" ·
 *  Orçamento = State Orçamento + Etapa Relacionamento Comercial.
 * Comparação sem acento/caixa/pontuação (a Etapa do Orçamento foi escrita "Relacionamento/Comercial").
 */
export function colunaDoPbi(p: { state: string; etapa: string; tags: string }): ColunaKanban | null {
  const state = normKanban(p.state);
  const etapa = normKanban(p.etapa);
  if (state === "backlog") {
    if (etapa === "backlog") return "backlog";
    if (etapa === "comite") return "comite";
    if (etapa === "analise" && temTag(p.tags, TAG_REFINAMENTO_TECH)) return "analise";
    return null;
  }
  if (state === "orcamento" && etapa.includes("relacionamento") && etapa.includes("comercial")) return "orcamento";
  return null;
}

/** Informativo (oculto por padrão na tela): regra de cada coluna e quando a demanda avança. */
export const COLUNAS_KANBAN: {
  chave: ColunaKanban;
  titulo: string;
  status: string;
  etapa: string;
  tag?: string;
  avanca: string;
  cor: "slate" | "indigo" | "sky" | "amber";
}[] = [
  {
    chave: "backlog",
    titulo: "Backlog Produto",
    status: "Backlog",
    etapa: "Backlog",
    avanca: "Pós triagem e priorização por PO para construção de proposta de solução e apresentação em Fórum de comitê",
    cor: "slate",
  },
  {
    chave: "comite",
    titulo: "Comitê",
    status: "Backlog",
    etapa: "Comitê",
    avanca: "Pós aprovação de proposta de solução em comitê de produto",
    cor: "indigo",
  },
  {
    chave: "analise",
    titulo: "Em Análise Tech",
    status: "Backlog",
    etapa: "Análise",
    tag: TAG_REFINAMENTO_TECH,
    avanca: "Pós análise do time de engenharia sobre arquitetura, esforço e dependências da proposta de solução.",
    cor: "sky",
  },
  {
    chave: "orcamento",
    titulo: "Orçamento",
    status: "Orçamento",
    etapa: "Relacionamento/Comercial",
    avanca: "Pós aceite comercial e de escopo por cliente da demanda",
    cor: "amber",
  },
];

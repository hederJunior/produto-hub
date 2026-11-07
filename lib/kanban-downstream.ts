/**
 * Kanban do Downstream (Roadmap e entregas > Downstream, pedido por Heder em 2026-11-05): PBIs em
 * execução distribuídos em 5 quadros — Ag. priorização, Refinamento, Desenvolvimento, Validação
 * interna e Aguardando Deploy — alguns com subdivisões internas, pelas regras de State + Etapa (+ Tag).
 * Só tipos e regras PURAS (sem fetch) — usado pela tela e pela consulta ao Azure (lib/devops-client.ts).
 */
import { TAG_REFINAMENTO_TECH } from "./backlog";
import { normKanban, temTag } from "./kanban-upstream";

export const TAG_AVALIACAO_PRODUTO = "Pronto para Avaliação produto";

/** Status (State) do Azure que alimentam o Kanban do Downstream. */
export const STATES_DOWNSTREAM = ["Execução", "Aguardando Deploy"] as const;

export type QuadroDownstream = "priorizacao" | "refinamento" | "desenvolvimento" | "validacao" | "deploy";

/** Identifica uma divisão (lane) do Kanban: "refinamento.tech", "validacao.qa"… */
export type ChaveDivisao = string;

export type DivisaoDownstream = {
  chave: ChaveDivisao;
  /** Nome da divisão ("Tech", "To Do"…); vazio quando o quadro não tem subdivisões. */
  titulo: string;
  /** State do Azure. */
  status: string;
  /** Etapa como aparece no Azure (mostrada em "Regras do fluxo"); "Qualquer etapa" quando `qualquerEtapa`. */
  etapa: string;
  /** Aceita PBI de qualquer Etapa (inclusive vazia) — só State (e Tag, se houver) decidem. */
  qualquerEtapa?: boolean;
  /** Outras grafias de Etapa aceitas além de `etapa` (comparação sem acento/caixa). */
  etapasAceitas?: string[];
  /** Tag exigida; a divisão com tag tem preferência sobre a irmã sem tag (ver divisaoDoPbi). */
  tag?: string;
};

export type DefinicaoQuadro = {
  chave: QuadroDownstream;
  titulo: string;
  cor: "slate" | "indigo" | "sky" | "amber" | "purple" | "green" | "red" | "orange";
  divisoes: DivisaoDownstream[];
};

/**
 * Regra de cada quadro. Atenção: a Etapa do quadro "Ag. priorização" foi pedida como "Aguardando
 * Alocação", mas no Azure (picklist de Custom.Etapa em KMM4 e KMM5) o valor existente é "Aguardando
 * Priorização" — que também dá nome ao quadro. Usamos o valor real e ainda aceitamos a outra grafia.
 */
export const QUADROS_DOWNSTREAM: DefinicaoQuadro[] = [
  {
    chave: "priorizacao",
    titulo: "Ag. priorização",
    cor: "slate",
    divisoes: [
      { chave: "priorizacao", titulo: "", status: "Execução", etapa: "Aguardando Priorização", etapasAceitas: ["Aguardando Alocação"] },
    ],
  },
  {
    chave: "refinamento",
    titulo: "Refinamento",
    cor: "indigo",
    divisoes: [
      { chave: "refinamento.tech", titulo: "Tech", status: "Execução", etapa: "Análise", tag: TAG_REFINAMENTO_TECH },
      { chave: "refinamento.produto", titulo: "Produto", status: "Execução", etapa: "Análise" },
    ],
  },
  {
    chave: "desenvolvimento",
    titulo: "Desenvolvimento",
    cor: "sky",
    divisoes: [
      { chave: "desenvolvimento.todo", titulo: "To Do", status: "Execução", etapa: "Backlog" },
      { chave: "desenvolvimento.doing", titulo: "Doing", status: "Execução", etapa: "Execução" },
    ],
  },
  {
    chave: "validacao",
    titulo: "Validação interna",
    cor: "amber",
    divisoes: [
      { chave: "validacao.qa", titulo: "QA", status: "Execução", etapa: "Validação interna" },
      { chave: "validacao.produto", titulo: "Produto", status: "Execução", etapa: "Validação interna", tag: TAG_AVALIACAO_PRODUTO },
    ],
  },
  {
    chave: "deploy",
    titulo: "Aguardando Deploy",
    cor: "green",
    // Sem subdivisões (2026-11-06): todo PBI em Aguardando Deploy, de qualquer Etapa.
    divisoes: [{ chave: "deploy", titulo: "", status: "Aguardando Deploy", etapa: "Qualquer etapa", qualquerEtapa: true }],
  },
];

/** Todas as divisões, na ordem de exibição (com o quadro a que pertencem). */
export const DIVISOES_DOWNSTREAM = QUADROS_DOWNSTREAM.flatMap((q) => q.divisoes.map((d) => ({ ...d, quadro: q.chave })));

export type ItemKanbanDownstream = {
  id: number;
  titulo: string;
  /** Area Path completo ("KMM5\TMS - Migracao"). */
  areaPath: string;
  /** TeamProject (KMM4/KMM5) — monta o link do PBI no Azure. */
  projeto: string;
  quadro: QuadroDownstream;
  divisao: ChaveDivisao;
  cliente: string;
  po: string;
  /** System.AssignedTo — "" quando não atribuído. */
  responsavel: string;
  /** System.CreatedDate (ISO). */
  createdDate: string;
  /** Microsoft.VSTS.Common.Priority (1–4) ou null. */
  prioridade: number | null;
};

/**
 * Divisão do PBI (null = não entra no Kanban). Casa State + Etapa sem acento/caixa/pontuação
 * ("Validação Interna" = "Validação interna"). O PBI aparece em UMA divisão só: quando ele satisfaz
 * duas divisões irmãs do mesmo quadro (ex.: Etapa Análise com a tag de refinamento tech cabe em Tech
 * e em Produto), vale a que exige a tag — a sem tag recebe os demais.
 */
export function divisaoDoPbi(p: { state: string; etapa: string; tags: string }): { quadro: QuadroDownstream; divisao: ChaveDivisao } | null {
  const state = normKanban(p.state);
  const etapa = normKanban(p.etapa);
  const candidatas = DIVISOES_DOWNSTREAM.filter(
    (d) =>
      normKanban(d.status) === state &&
      (d.qualquerEtapa || [d.etapa, ...(d.etapasAceitas ?? [])].some((e) => normKanban(e) === etapa)) &&
      (!d.tag || temTag(p.tags, d.tag))
  );
  const escolhida = candidatas.find((d) => d.tag) ?? candidatas[0];
  return escolhida ? { quadro: escolhida.quadro, divisao: escolhida.chave } : null;
}

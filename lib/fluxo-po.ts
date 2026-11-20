/**
 * Fluxo do PO (Fase 1, Upstream) — REGRAS PURAS: sem fetch, sem banco, sem React. Usado pela tela, pelas rotas de
 * gravação (que revalidam tudo no servidor) e pelos testes (`lib/fluxo-po.test.ts`).
 *
 * Fonte das regras: `docs/fluxo-po-decisoes.md`. Nomes técnicos do Azure: `lib/fluxo-po-campos.ts`.
 *
 * Princípio: a etapa (coluna) é SEMPRE derivada dos campos do PBI (`derivarEtapa`). Mover um card = gravar os
 * campos que levam o PBI ao estado da etapa de destino (`avaliarMovimento` devolve as alterações; nada é gravado aqui).
 */
import {
  AREA_RAIZ_KMM5,
  CAMPOS_PBI,
  CLASSIFICACOES_AZURE,
  DIAS_ALERTA_AGING,
  ETAPA,
  STATUS,
  TAG_PRONTO_REFINAMENTO_TECH,
} from "./fluxo-po-campos";

// ---------------------------------------------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------------------------------------------

export type EtapaFluxo = "1.1" | "1.2" | "2.1" | "3.1" | "3.2" | "4.1";

export const ETAPAS_FLUXO: readonly { codigo: EtapaFluxo; nome: string; movimenta: boolean }[] = [
  { codigo: "1.1", nome: "Classificação", movimenta: true },
  { codigo: "1.2", nome: "Priorizar e propor solução", movimenta: true },
  { codigo: "2.1", nome: "Comitê / Proposta de solução", movimenta: true },
  // Fase 1: só exibição (sem regras de movimento).
  { codigo: "3.1", nome: "Análise de engenharia", movimenta: false },
  { codigo: "3.2", nome: "Consolidação da proposta", movimenta: false },
  { codigo: "4.1", nome: "Proposta ao cliente", movimenta: false },
];

export function nomeDaEtapa(codigo: EtapaFluxo): string {
  return ETAPAS_FLUXO.find((e) => e.codigo === codigo)?.nome ?? codigo;
}

/** "1.2 Priorizar e propor solução" — usado nos comentários e nas mensagens. */
export function rotuloDaEtapa(codigo: EtapaFluxo): string {
  return `${codigo} ${nomeDaEtapa(codigo)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// PBI e utilidades
// ---------------------------------------------------------------------------------------------------------------

/** Os campos do PBI que o fluxo usa (tudo já normalizado pela leitura: texto "" quando vazio, datas em ISO ou null). */
export type PbiFluxo = {
  id: number;
  titulo: string;
  status: string;
  etapa: string;
  areaPath: string;
  /** System.Tags — string separada por ";". */
  tags: string;
  cliente: string;
  classificacao: string;
  dataAberturaProduto: string | null;
  dataComite: string | null;
  prioridade: number | null;
  criadoEm: string | null;
  /** System.Rev (para o teste de concorrência na gravação). */
  rev?: number;
};

/** Minúsculo, sem acento e sem pontuação ("Relacionamento/Comercial" → "relacionamento comercial"). */
export function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const preenchido = (s: string | null | undefined): boolean => String(s ?? "").trim() !== "";

export function temTag(tags: string, tag: string): boolean {
  const alvo = norm(tag);
  return String(tags ?? "").split(";").some((t) => norm(t) === alvo);
}

/** Acrescenta a tag (sem duplicar), mantendo as demais. Devolve a string no formato do Azure ("a; b"). */
export function adicionarTag(tags: string, tag: string): string {
  if (temTag(tags, tag)) return String(tags ?? "");
  const atuais = String(tags ?? "").split(";").map((t) => t.trim()).filter(Boolean);
  return [...atuais, tag].join("; ");
}

/** Remove a tag (sem diferenciar caixa/acento), mantendo as demais. "" quando não sobra nenhuma. */
export function removerTag(tags: string, tag: string): string {
  const alvo = norm(tag);
  return String(tags ?? "").split(";").map((t) => t.trim()).filter((t) => t && norm(t) !== alvo).join("; ");
}

/** O Area Path é exatamente a raiz do KMM5 (esteira ainda não definida)? */
export function estaNaAreaRaiz(areaPath: string | null | undefined): boolean {
  return norm(areaPath) === norm(AREA_RAIZ_KMM5);
}

/** Area Path dentro do KMM5 (a raiz ou uma esteira filha). */
function areaDoKmm5(areaPath: string): boolean {
  const a = String(areaPath ?? "").trim();
  return estaNaAreaRaiz(a) || norm(a.split("\\")[0]) === norm(AREA_RAIZ_KMM5);
}

// ---------------------------------------------------------------------------------------------------------------
// Etapa derivada dos campos do PBI
// ---------------------------------------------------------------------------------------------------------------

export type DerivacaoEtapa = {
  /** Coluna do card; null = o PBI não faz parte do quadro (ex.: Status Execução). */
  etapa: EtapaFluxo | null;
  /** Estado fora das regras: o card aparece em vermelho na coluna mais próxima, com o motivo. */
  inconsistencia: string | null;
};

/**
 * Backlog + Etapa Backlog: Area = KMM5 → 1.1; Area ≠ KMM5 → 1.2.
 * Backlog + Etapa Comitê → 2.1 (se a Data Comitê estiver vazia o card fica em 2.1 mas inconsistente).
 * Backlog + Etapa Análise: com a tag → 3.1; sem a tag → 3.2.
 * Orçamento + Etapa Relacionamento/Comercial → 4.1.
 * Qualquer outra combinação não faz parte do quadro (a Triagem não existe no painel).
 */
export function derivarEtapa(pbi: Pick<PbiFluxo, "status" | "etapa" | "areaPath" | "tags" | "dataComite">): DerivacaoEtapa {
  const status = norm(pbi.status);
  const etapa = norm(pbi.etapa);
  const semEtapa: DerivacaoEtapa = { etapa: null, inconsistencia: null };

  if (status === norm(STATUS.backlog)) {
    if (etapa === norm(ETAPA.backlog)) {
      return { etapa: estaNaAreaRaiz(pbi.areaPath) ? "1.1" : "1.2", inconsistencia: null };
    }
    if (etapa === norm(ETAPA.comite)) {
      return {
        etapa: "2.1",
        inconsistencia: preenchido(pbi.dataComite) ? null : "Etapa Comitê sem Data Comitê preenchida",
      };
    }
    if (etapa === norm(ETAPA.analise)) {
      return { etapa: temTag(pbi.tags, TAG_PRONTO_REFINAMENTO_TECH) ? "3.1" : "3.2", inconsistencia: null };
    }
    return semEtapa;
  }
  if (status === norm(STATUS.orcamento) && etapa === norm(ETAPA.relacionamentoComercial)) {
    return { etapa: "4.1", inconsistencia: null };
  }
  return semEtapa;
}

// ---------------------------------------------------------------------------------------------------------------
// Datas, aging e atraso
// ---------------------------------------------------------------------------------------------------------------

/** "AAAA-MM-DD" de uma data ISO do Azure (ignora hora/fuso: as datas do fluxo são datas de calendário). */
export function chaveDia(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function chaveDeHoje(hoje: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}`;
}

function diasEntre(chaveA: string, chaveB: string): number {
  const [a, b] = [chaveA, chaveB].map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

/** Aging em dias = hoje − Data Abertura Produto (sem ela, Created Date). null quando nenhuma das duas existe. */
export function agingEmDias(pbi: Pick<PbiFluxo, "dataAberturaProduto" | "criadoEm">, hoje: Date): number | null {
  const base = chaveDia(pbi.dataAberturaProduto) ?? chaveDia(pbi.criadoEm);
  return base ? Math.max(0, diasEntre(base, chaveDeHoje(hoje))) : null;
}

/** Alerta vermelho do aging: mais de 30 dias. */
export function agingEmAlerta(dias: number | null): boolean {
  return dias !== null && dias > DIAS_ALERTA_AGING;
}

/** Data Comitê já passou (antes de hoje)? Só faz sentido para cards da 2.1. */
export function comiteAtrasado(dataComite: string | null | undefined, hoje: Date): boolean {
  const dia = chaveDia(dataComite);
  return dia !== null && dia < chaveDeHoje(hoje);
}

// ---------------------------------------------------------------------------------------------------------------
// Movimentos
// ---------------------------------------------------------------------------------------------------------------

/** Valores que o usuário informa na tela durante o movimento (sobrepõem os do PBI para validar e gravar). */
export type EntradaMovimento = Partial<
  Pick<PbiFluxo, "areaPath" | "classificacao" | "cliente" | "dataAberturaProduto" | "dataComite">
>;

/** Uma gravação em um campo do PBI. `para: null` remove o valor do campo. */
export type Alteracao = {
  campo: string;
  rotulo: string;
  de: string | null;
  para: string | null;
};

export type AvaliacaoMovimento = {
  /** Etapa derivada do PBI na hora da avaliação (null = fora do quadro). */
  origem: EtapaFluxo | null;
  destino: EtapaFluxo;
  direcao: "avanco" | "volta" | null;
  permitido: boolean;
  /** Motivos do bloqueio (vazio quando permitido). Nada é gravado enquanto houver motivo. */
  faltas: string[];
  avisos: string[];
  /** O que será gravado no PBI (vazio quando bloqueado). Não inclui o comentário nem o log. */
  alteracoes: Alteracao[];
  /** 1.2 → 2.1: a Data Comitê também vai para todos os Assesments filhos (sem filhos: avisa e segue). */
  replicarDataComiteAssesments: boolean;
  /** O que a volta altera ainda é PROPOSTA a validar com o Heder (docs/fluxo-po-decisoes.md §4). */
  proposta: boolean;
};

const AVANCOS: Partial<Record<EtapaFluxo, EtapaFluxo[]>> = { "1.1": ["1.2"], "1.2": ["2.1"], "2.1": ["3.1", "3.2"] };
/** Proposta: 2.1 → 1.2 (Etapa Comitê → Backlog, mantém Data Comitê); 1.2 → 1.1 (Area Path volta para KMM5). */
const VOLTAS: Partial<Record<EtapaFluxo, EtapaFluxo>> = { "2.1": "1.2", "1.2": "1.1" };

/** Destinos possíveis a partir da etapa (avanços e a volta). */
export function destinosPossiveis(origem: EtapaFluxo | null): { destino: EtapaFluxo; direcao: "avanco" | "volta" }[] {
  if (!origem) return [];
  return [
    ...(AVANCOS[origem] ?? []).map((destino) => ({ destino, direcao: "avanco" as const })),
    ...(VOLTAS[origem] ? [{ destino: VOLTAS[origem]!, direcao: "volta" as const }] : []),
  ];
}

function sobrepor(pbi: PbiFluxo, entrada: EntradaMovimento): PbiFluxo {
  const efetivo = { ...pbi };
  for (const k of ["areaPath", "classificacao", "cliente", "dataAberturaProduto", "dataComite"] as const) {
    if (entrada[k] !== undefined) (efetivo as Record<string, unknown>)[k] = entrada[k];
  }
  return efetivo;
}

function dataValida(valor: string | null | undefined): boolean {
  const dia = chaveDia(valor);
  if (!dia) return false;
  const [y, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Alterações só dos campos que realmente mudam (comparação sem espaços nas pontas). */
function diferenca(campo: string, rotulo: string, de: string | null, para: string | null): Alteracao[] {
  const a = (de ?? "").trim();
  const b = (para ?? "").trim();
  return a === b ? [] : [{ campo, rotulo, de: de === null || a === "" ? null : de, para: b === "" ? null : para }];
}

/**
 * Avalia mover o PBI para `destino`: diz se pode, o que falta e o que seria gravado. Pura: o servidor chama esta
 * mesma função com o PBI recém-lido do Azure antes de qualquer gravação (a tela não é confiável).
 */
export function avaliarMovimento(pbi: PbiFluxo, destino: EtapaFluxo, entrada: EntradaMovimento = {}): AvaliacaoMovimento {
  const { etapa: origem } = derivarEtapa(pbi);
  const rota = destinosPossiveis(origem).find((d) => d.destino === destino);
  const base: AvaliacaoMovimento = {
    origem,
    destino,
    direcao: rota?.direcao ?? null,
    permitido: false,
    faltas: [],
    avisos: [],
    alteracoes: [],
    replicarDataComiteAssesments: false,
    proposta: rota?.direcao === "volta",
  };

  if (!origem) return { ...base, faltas: ["O PBI não está em nenhuma etapa do fluxo."] };
  if (!rota) {
    return { ...base, faltas: [`Movimento de ${rotuloDaEtapa(origem)} para ${rotuloDaEtapa(destino)} não é permitido.`] };
  }

  const faltas: string[] = [];
  const alteracoes: Alteracao[] = [];
  let replicar = false;
  const ef = sobrepor(pbi, entrada);

  if (rota.direcao === "avanco") {
    if (origem === "1.1") {
      // 1.1 → 1.2: esteira definida (Area ≠ KMM5), Classificação, Cliente e Data Abertura Produto.
      if (!preenchido(ef.areaPath)) faltas.push("Definir a esteira (Area Path).");
      else if (estaNaAreaRaiz(ef.areaPath)) faltas.push("Definir a esteira: o Area Path ainda é a raiz KMM5.");
      else if (!areaDoKmm5(ef.areaPath)) faltas.push("O Area Path precisa ser uma esteira do KMM5.");
      if (!preenchido(ef.classificacao)) faltas.push("Preencher a Classificação.");
      else if (!CLASSIFICACOES_AZURE.some((c) => norm(c) === norm(ef.classificacao))) {
        faltas.push(`Classificação "${ef.classificacao}" não existe na lista do Azure.`);
      }
      if (!preenchido(ef.cliente)) faltas.push("Preencher o Cliente.");
      if (!preenchido(ef.dataAberturaProduto)) faltas.push("Preencher a Data Abertura Produto.");
      else if (!dataValida(ef.dataAberturaProduto)) faltas.push("Data Abertura Produto inválida.");
      // Status Backlog e Etapa Backlog não mudam; grava o que foi informado.
      alteracoes.push(
        ...diferenca(CAMPOS_PBI.areaPath, "Area Path", pbi.areaPath, ef.areaPath),
        ...diferenca(CAMPOS_PBI.classificacao, "Classificação", pbi.classificacao, ef.classificacao),
        ...diferenca(CAMPOS_PBI.cliente, "Cliente", pbi.cliente, ef.cliente),
        ...diferenca(CAMPOS_PBI.dataAberturaProduto, "Data Abertura Produto", pbi.dataAberturaProduto, ef.dataAberturaProduto),
      );
    } else if (origem === "1.2") {
      // 1.2 → 2.1: Data Comitê preenchida; Etapa Backlog → Comitê (Status continua Backlog).
      if (!preenchido(ef.dataComite)) faltas.push("Preencher a Data Comitê.");
      else if (!dataValida(ef.dataComite)) faltas.push("Data Comitê inválida.");
      alteracoes.push(
        ...diferenca(CAMPOS_PBI.etapa, "Etapa", pbi.etapa, ETAPA.comite),
        ...diferenca(CAMPOS_PBI.dataComite, "Data Comitê", pbi.dataComite, ef.dataComite),
      );
      replicar = true;
    } else if (origem === "2.1") {
      // 2.1 → 3.1 / 3.2: Data Comitê preenchida e Status Backlog (garantido pela derivação).
      if (!preenchido(ef.dataComite)) faltas.push("Preencher a Data Comitê.");
      if (norm(pbi.status) !== norm(STATUS.backlog)) faltas.push("O Status precisa continuar Backlog.");
      alteracoes.push(...diferenca(CAMPOS_PBI.etapa, "Etapa", pbi.etapa, ETAPA.analise));
      const novaTags = destino === "3.1" ? adicionarTag(pbi.tags, TAG_PRONTO_REFINAMENTO_TECH) : removerTag(pbi.tags, TAG_PRONTO_REFINAMENTO_TECH);
      alteracoes.push(...diferenca(CAMPOS_PBI.tags, "Tags", pbi.tags, novaTags));
    }
  } else if (origem === "2.1") {
    // PROPOSTA — 2.1 → 1.2: Etapa Comitê volta para Backlog; a Data Comitê é mantida.
    alteracoes.push(...diferenca(CAMPOS_PBI.etapa, "Etapa", pbi.etapa, ETAPA.backlog));
    base.avisos.push("Proposta de volta: a Etapa volta para Backlog e a Data Comitê é mantida (a validar com o Heder).");
  } else if (origem === "1.2") {
    // PROPOSTA — 1.2 → 1.1: o Area Path volta para a raiz KMM5.
    alteracoes.push(...diferenca(CAMPOS_PBI.areaPath, "Area Path", pbi.areaPath, AREA_RAIZ_KMM5));
    base.avisos.push("Proposta de volta: o Area Path volta para KMM5 (a validar com o Heder).");
  }

  if (faltas.length) return { ...base, faltas };
  return { ...base, permitido: true, alteracoes, replicarDataComiteAssesments: replicar };
}

/**
 * Prontidão do card no quadro: "Pronto para mover" ou a lista do que falta para avançar, usando só os campos do PBI
 * (sem entrada do usuário). null para etapas sem movimento na Fase 1 (3.1, 3.2, 4.1) e para cards fora do quadro.
 */
export function prontidaoDoCard(pbi: PbiFluxo): { pronto: boolean; faltas: string[] } | null {
  const { etapa } = derivarEtapa(pbi);
  if (!etapa) return null;
  const avanco = destinosPossiveis(etapa).find((d) => d.direcao === "avanco");
  if (!avanco) return null;
  const av = avaliarMovimento(pbi, avanco.destino);
  return { pronto: av.permitido, faltas: av.faltas };
}

/** Contadores por coluna: total, prontos e bloqueados (cards sem movimento na Fase 1 só entram no total). */
export function contarPorEtapa(pbis: PbiFluxo[]): Record<EtapaFluxo, { total: number; prontos: number; bloqueados: number }> {
  const out = Object.fromEntries(ETAPAS_FLUXO.map((e) => [e.codigo, { total: 0, prontos: 0, bloqueados: 0 }])) as Record<
    EtapaFluxo,
    { total: number; prontos: number; bloqueados: number }
  >;
  for (const pbi of pbis) {
    const { etapa } = derivarEtapa(pbi);
    if (!etapa) continue;
    out[etapa].total++;
    const p = prontidaoDoCard(pbi);
    if (p) p.pronto ? out[etapa].prontos++ : out[etapa].bloqueados++;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Quadro: cards por coluna
// ---------------------------------------------------------------------------------------------------------------

export type CardFluxo = {
  pbi: PbiFluxo;
  etapa: EtapaFluxo;
  /** Estado fora das regras (card em vermelho na coluna mais próxima) ou null. */
  inconsistencia: string | null;
  /** "Pronto para mover" / o que falta; null nas etapas sem movimento na Fase 1. */
  prontidao: { pronto: boolean; faltas: string[] } | null;
};

/** Ordem do Kanban Upstream: prioridade (1 = mais urgente; sem prioridade por último) → mais antigo primeiro → ID. */
function compararCards(a: CardFluxo, b: CardFluxo): number {
  const pa = a.pbi.prioridade ?? 99;
  const pb = b.pbi.prioridade ?? 99;
  if (pa !== pb) return pa - pb;
  const da = chaveDia(a.pbi.dataAberturaProduto) ?? chaveDia(a.pbi.criadoEm) ?? "9999-12-31";
  const db = chaveDia(b.pbi.dataAberturaProduto) ?? chaveDia(b.pbi.criadoEm) ?? "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  return a.pbi.id - b.pbi.id;
}

/** PBIs → cards ordenados; PBIs fora do quadro (etapa não derivável) ficam de fora. */
export function montarCards(pbis: PbiFluxo[]): CardFluxo[] {
  const cards: CardFluxo[] = [];
  for (const pbi of pbis) {
    const { etapa, inconsistencia } = derivarEtapa(pbi);
    if (etapa) cards.push({ pbi, etapa, inconsistencia, prontidao: prontidaoDoCard(pbi) });
  }
  return cards.sort(compararCards);
}

export function agruparPorEtapa(cards: CardFluxo[]): Record<EtapaFluxo, CardFluxo[]> {
  const out = Object.fromEntries(ETAPAS_FLUXO.map((e) => [e.codigo, [] as CardFluxo[]])) as Record<EtapaFluxo, CardFluxo[]>;
  for (const c of cards) out[c.etapa].push(c);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Permissão (a verificação REAL é no servidor, em toda gravação)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Papéis do cadastro de acesso (AllowedUser.papel, texto livre) que podem movimentar cards. Comparados sem caixa nem
 * acento; o campo pode trazer mais de um papel separado por vírgula, ponto e vírgula, barra ou "e" ("PM/PO").
 * Decisão do Heder (2026-11-20): PM, PO, GPM e Product Ops movimentam; usuários com tipo "adm" também. Os demais só visualizam.
 */
export const PAPEIS_MOVIMENTADORES = [
  "pm", "po", "gpm", "product ops", "product operations", "product manager", "product owner",
] as const;

export function podeMovimentar(papel: string | null | undefined, tipo?: string | null): boolean {
  if (norm(tipo) === "adm") return true;
  return String(papel ?? "")
    .split(/[,;/|]|\s+e\s+/i)
    .map(norm)
    .some((p) => (PAPEIS_MOVIMENTADORES as readonly string[]).includes(p));
}

/** O fluxo existe só no KMM5. */
export function projetoSuportado(projeto: string | null | undefined): boolean {
  return norm(projeto) === "kmm5";
}

// ---------------------------------------------------------------------------------------------------------------
// Gravação no Azure (montagem do json-patch e do comentário; quem chama é a rota de servidor)
// ---------------------------------------------------------------------------------------------------------------

export type OperacaoPatch = { op: "test" | "add" | "remove"; path: string; value?: string | number };

/**
 * json-patch do Azure para as alterações. Começa com `test /rev` (a gravação falha se alguém mexeu no PBI depois da
 * leitura — confirmado na T02). `para: null` remove o campo; os demais usam `add` (que também substitui).
 */
export function paraJsonPatch(alteracoes: Alteracao[], rev: number): OperacaoPatch[] {
  const ops: OperacaoPatch[] = [{ op: "test", path: "/rev", value: rev }];
  for (const a of alteracoes) {
    if (a.para === null) {
      if (a.de !== null) ops.push({ op: "remove", path: `/fields/${a.campo}` });
    } else {
      ops.push({ op: "add", path: `/fields/${a.campo}`, value: a.para });
    }
  }
  return ops;
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Texto do comentário de transição publicado no PBI. O autor do comentário no Azure é o dono do PAT, não o usuário
 * logado (T02): por isso usuário e data vão no texto. Data no fuso de Brasília.
 */
export function comentarioDeTransicao(args: { origem: EtapaFluxo; destino: EtapaFluxo; usuario: string; quando: Date; direcao?: "avanco" | "volta" }): string {
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(args.quando);
  const verbo = args.direcao === "volta" ? "voltou" : "avançou";
  return (
    `<b>Fluxo do PO</b>: o card ${verbo} de <b>${escaparHtml(rotuloDaEtapa(args.origem))}</b> ` +
    `para <b>${escaparHtml(rotuloDaEtapa(args.destino))}</b>.<br>` +
    `Usuário: ${escaparHtml(args.usuario)} · Data: ${data}`
  );
}

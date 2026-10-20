/**
 * Priorização GUT (Gravidade × Urgência × Tendência) dos débitos técnicos da área SWAT — recriação
 * da planilha "Priorizacao_GUT_Debitos_Tecnicos.xlsx" (pedido por Heder em 2026-10-19), seção
 * Backlog do Roadmap e entregas. Só tipos e regras PURAS (sem fetch): usado pela tela (client) e pelas rotas.
 *
 * Fórmulas da planilha, como ficaram aqui:
 *   Pontuação GUT  = SE(as 3 notas preenchidas; G × U × T; vazio)         → pontuacaoGut()
 *   Prioridade GUT = faixas por pontuação mínima (80 / 40 / 15 / 1)        → faixaDaPontuacao()
 *   Resumo         = contagens sobre os itens                              → resumoGut()
 */

export const STATUS_AVALIACAO = ["Pendente de avaliação", "Em avaliação", "Avaliado"] as const;
export type StatusAvaliacao = (typeof STATUS_AVALIACAO)[number];

/** Colunas A–K da planilha: dados do Azure DevOps (somente leitura). */
export type ItemGut = {
  id: number;
  titulo: string;
  tipo: string;
  responsavel: string;
  state: string;
  /** Custom.Etapa (etapa do fluxo, ao lado do State). */
  etapa: string;
  tags: string;
  cliente: string;
  colunaBoard: string;
  classificacao: string;
  /** Custom "Data Comitê" (data pura, ex. "2026-10-16T00:00:00Z") ou null. */
  dataComite: string | null;
  /** Custom.DataAberturaProduto (ISO) ou null. */
  dataAberturaProduto: string | null;
};

/** Colunas L–N e Q–S da planilha: preenchimento da squad (persistido em PriorizacaoGut). */
export type AvaliacaoGut = {
  gravidade: number | null;
  urgencia: number | null;
  tendencia: number | null;
  justificativa: string;
  acao: string;
  status: StatusAvaliacao;
  atualizadoPor?: string | null;
  atualizadoEm?: string | null;
};

export const AVALIACAO_VAZIA: AvaliacaoGut = {
  gravidade: null,
  urgencia: null,
  tendencia: null,
  justificativa: "",
  acao: "",
  status: "Pendente de avaliação",
};

export type FaixaGut = { codigo: string; min: number; bg: string; fg: string };

/** Aba "Critérios GUT": faixas propostas (pontuação mínima) e as cores da formatação condicional. Fixas no código. */
export const FAIXAS_GUT: FaixaGut[] = [
  { codigo: "P1 — Crítica", min: 80, bg: "#F4C7C3", fg: "#7B1E1E" },
  { codigo: "P2 — Alta", min: 40, bg: "#FCE0C2", fg: "#7F3F00" },
  { codigo: "P3 — Média", min: 15, bg: "#FFF2CC", fg: "#6B5900" },
  { codigo: "P4 — Baixa", min: 1, bg: "#E2EFDA", fg: "#2F5D1E" },
];

export const NOTA_MIN = 1;
export const NOTA_MAX = 5;

export function notaValida(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= NOTA_MIN && (n as number) <= NOTA_MAX;
}

/** =SE(CONT(L:N)=3; L*M*N; "") — null enquanto faltar qualquer uma das 3 notas. */
export function pontuacaoGut(a: Pick<AvaliacaoGut, "gravidade" | "urgencia" | "tendencia">): number | null {
  const { gravidade: g, urgencia: u, tendencia: t } = a;
  if (g == null || u == null || t == null) return null;
  return g * u * t;
}

/** Faixa da pontuação (≥80 P1, ≥40 P2, ≥15 P3, senão P4); null sem pontuação. */
export function faixaDaPontuacao(pontos: number | null): FaixaGut | null {
  if (pontos == null) return null;
  return FAIXAS_GUT.find((f) => pontos >= f.min) ?? FAIXAS_GUT[FAIXAS_GUT.length - 1];
}

export type ResumoGut = {
  total: number;
  avaliados: number;
  pendentes: number;
  /** 0–1 */
  percentualAvaliados: number;
  porPrioridade: { codigo: string; itens: number }[];
  porStatus: { status: StatusAvaliacao; itens: number }[];
};

/** Aba "Resumo": total, avaliados (3 notas), pendentes = total − avaliados, % e as duas distribuições. */
export function resumoGut(itens: ItemGut[], avaliacoes: Record<number, AvaliacaoGut | undefined>): ResumoGut {
  let avaliados = 0;
  const porPrioridade = new Map(FAIXAS_GUT.map((f) => [f.codigo, 0]));
  const porStatus = new Map<StatusAvaliacao, number>(STATUS_AVALIACAO.map((s) => [s, 0]));
  for (const it of itens) {
    const a = avaliacoes[it.id] ?? AVALIACAO_VAZIA;
    const pontos = pontuacaoGut(a);
    if (pontos != null) {
      avaliados += 1;
      const faixa = faixaDaPontuacao(pontos)!;
      porPrioridade.set(faixa.codigo, (porPrioridade.get(faixa.codigo) ?? 0) + 1);
    }
    porStatus.set(a.status, (porStatus.get(a.status) ?? 0) + 1);
  }
  const total = itens.length;
  return {
    total,
    avaliados,
    pendentes: total - avaliados,
    percentualAvaliados: total ? avaliados / total : 0,
    porPrioridade: Array.from(porPrioridade, ([codigo, n]) => ({ codigo, itens: n })),
    porStatus: Array.from(porStatus, ([status, n]) => ({ status, itens: n })),
  };
}

/** Texto da aba "Critérios GUT" (escalas de 1 a 5), copiado da planilha. */
export const ESCALAS_GUT: { eixo: string; titulo: string; niveis: { nota: number; nivel: string; descricao: string }[] }[] = [
  {
    eixo: "G",
    titulo: "Gravidade (G) — impacto do problema",
    niveis: [
      { nota: 1, nivel: "Muito baixo", descricao: "Impacto mínimo, sem consequência operacional relevante conhecida." },
      { nota: 2, nivel: "Baixo", descricao: "Impacto limitado, com pouca interferência na operação." },
      { nota: 3, nivel: "Médio", descricao: "Impacto perceptível na operação, manutenção ou produtividade." },
      { nota: 4, nivel: "Alto", descricao: "Impacto significativo, risco operacional importante ou retrabalho recorrente." },
      { nota: 5, nivel: "Muito alto", descricao: "Impacto crítico, risco relevante para a operação, integridade dos dados, segurança ou continuidade do serviço." },
    ],
  },
  {
    eixo: "U",
    titulo: "Urgência (U) — necessidade de tratamento",
    niveis: [
      { nota: 1, nivel: "Muito baixa", descricao: "Pode ser planejado para um momento futuro, sem pressão conhecida." },
      { nota: 2, nivel: "Baixa", descricao: "Convém tratar, mas não há necessidade de ação próxima identificada." },
      { nota: 3, nivel: "Média", descricao: "Deve ser programado em horizonte razoável." },
      { nota: 4, nivel: "Alta", descricao: "Precisa de tratamento prioritário em curto prazo." },
      { nota: 5, nivel: "Muito alta", descricao: "Requer ação imediata ou o quanto antes, considerando os riscos e compromissos conhecidos." },
    ],
  },
  {
    eixo: "T",
    titulo: "Tendência (T) — evolução do problema se não for tratado",
    niveis: [
      { nota: 1, nivel: "Muito baixa", descricao: "Tende a permanecer estável, sem agravamento conhecido." },
      { nota: 2, nivel: "Baixa", descricao: "Pode piorar lentamente." },
      { nota: 3, nivel: "Média", descricao: "Há possibilidade de agravamento progressivo." },
      { nota: 4, nivel: "Alta", descricao: "Tende a aumentar o impacto, a frequência de falhas ou o custo de manutenção." },
      { nota: 5, nivel: "Muito alta", descricao: "Tende a se agravar rapidamente, ampliar riscos ou comprometer outras funcionalidades." },
    ],
  },
];

export const ORIENTACOES_GUT: string[] = [
  "Não confunda gravidade com urgência: um problema pode ser grave sem exigir ação imediata; outro pode exigir ação rápida por causa de um prazo ou risco iminente.",
  "Avalie G, U e T de forma independente, uma de cada vez, antes de olhar a pontuação final.",
  "Baseie as notas em fatos documentados (descrição do item, chamados, incidentes, compromissos). Não presuma impactos, frequências, riscos, dependências ou prazos que não estejam registrados.",
  'O título sozinho raramente basta. Se a descrição for insuficiente, deixe G, U e T vazias, mantenha o status "Pendente de avaliação" e registre na justificativa o que falta saber.',
  "Registre sempre a justificativa de cada nota; ela permite revisar a decisão depois e reduz divergências entre avaliadores.",
  "Use o mesmo horizonte de tempo e a mesma referência de impacto para todos os itens. Discutam em grupo os casos de nota 4 ou 5 e os que ficarem perto do limite entre faixas.",
  'Use o status "Em avaliação" enquanto a squad discute e "Avaliado" quando as três notas e a justificativa estiverem acordadas.',
  "Em empate de pontuação não há critério adicional automático: a ordem entre itens empatados é decisão da squad.",
  "A pontuação GUT apoia a decisão, mas não substitui a análise da squad sobre dependências técnicas, esforço, compromissos legais, riscos de segurança e prioridades estratégicas.",
];

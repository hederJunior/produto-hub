/**
 * Downstream > "Previsão de Entregas" (pedido por Heder em 2026-11-11): PBIs ainda não concluídos
 * agrupados pela sprint (Iteration do próprio PBI), no modelo da lista de "Backlog Carteira". Só tipos
 * e regras PURAS (sem fetch) — usado pela tela e pela consulta ao Azure (lib/devops-client.ts).
 */

export type ItemPrevisao = {
  id: number;
  titulo: string;
  areaPath: string;
  /** TeamProject (KMM4/KMM5) — monta o link do PBI no Azure. */
  projeto: string;
  /** System.IterationPath completo ("KMM5\2026\Sprint 8.19"). */
  iterationPath: string;
  state: string;
  etapa: string;
  cliente: string;
  po: string;
  classificacao: string;
};

/** Sprint com itens: o nome é o 3º nível do Iteration Path; as datas vêm da árvore de iterations do projeto. */
export type SprintPrevisao = {
  /** Iteration Path completo — chave do grupo (KMM4 e KMM5 têm sprints com nomes diferentes). */
  chave: string;
  projeto: string;
  /** "Sprint 8.19". */
  nome: string;
  /** Datas puras "YYYY-MM-DD" ou null quando a sprint não tem datas cadastradas. */
  inicio: string | null;
  fim: string | null;
};

/** Sprint = 3º nível do Iteration Path ("KMM5\2026\Sprint 8.19"); 1º/2º nível = sem sprint (null). */
export function sprintDoIteration(iterationPath: string): string | null {
  const partes = iterationPath.split("\\");
  return partes.length >= 3 ? partes[2] : null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** PBI já entregue ou descartado (Finalizado/Cancelado, em qualquer caixa): fora da previsão. */
export function estaEncerrado(state: string): boolean {
  const s = norm(state);
  return s === "finalizado" || s.startsWith("cancel");
}

/** Sprint já terminou (fim anterior a hoje)? Sem data de fim, considera em aberto. */
export function sprintEncerrada(s: SprintPrevisao, hojeChave: string): boolean {
  return !!s.fim && s.fim < hojeChave;
}

/** Sprint em andamento hoje (início ≤ hoje ≤ fim)? */
export function sprintAtual(s: SprintPrevisao, hojeChave: string): boolean {
  return !!s.inicio && !!s.fim && s.inicio <= hojeChave && hojeChave <= s.fim;
}

/** Ordem cronológica (fim da sprint); sem datas vai para o fim, ordenado pelo número da sprint. */
export function compararSprints(a: SprintPrevisao, b: SprintPrevisao): number {
  if (a.fim && b.fim) return a.fim.localeCompare(b.fim) || a.projeto.localeCompare(b.projeto);
  if (a.fim) return -1;
  if (b.fim) return 1;
  return a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }) || a.projeto.localeCompare(b.projeto);
}

/** "Sprint 8.19" → "8.19" (rótulo curto do gráfico). */
export function numeroDaSprint(nome: string): string {
  return nome.replace(/^sprint\s*/i, "").trim() || nome;
}

/**
 * Áreas que a Previsão de Entregas considera (pedido por Heder em 2026-11-25): só "Projetos de Implantação" e "Obrigações Legais e
 * Financeiras". Compara o ÚLTIMO nível do Area Path, sem o prefixo "TMS - ", sem acento nem caixa (no Azure o nome vem como
 * "KMM5\TMS - Projetos de Implantacao"); vale para KMM4 e KMM5.
 */
export const AREAS_DA_PREVISAO = ["Projetos de Implantação", "Obrigações Legais e Financeiras"] as const;

export function areaDaPrevisao(areaPath: string | null | undefined): boolean {
  const partes = String(areaPath ?? "").split("\\").map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return false;
  const nome = norm(partes[partes.length - 1].replace(/^TMS\s*-\s*/i, ""));
  return AREAS_DA_PREVISAO.some((a) => norm(a) === nome);
}

/** Fica só com os PBIs das áreas da Previsão e com as sprints que ainda têm algum deles (sem grupo vazio). */
export function restringirPrevisao(itens: ItemPrevisao[], sprints: SprintPrevisao[]): { itens: ItemPrevisao[]; sprints: SprintPrevisao[] } {
  const doEscopo = itens.filter((i) => areaDaPrevisao(i.areaPath));
  const comItem = new Set(doEscopo.map((i) => i.iterationPath));
  return { itens: doEscopo, sprints: sprints.filter((s) => comItem.has(s.chave)) };
}

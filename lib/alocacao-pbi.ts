/**
 * Regras da função "Alocar PBI" do Planejamento de capacidade (pedido por Heder em 2026-10-14):
 * a partir de um PBI na etapa "Aguardando Priorização", mover uma Task/Bug filha pra uma sprint e
 * atribuí-la a um dev. Módulo sem dependência de servidor — usado pela tela (pra desabilitar o
 * botão e mostrar o motivo) e pela API (que revalida tudo antes de gravar no Azure DevOps).
 */

export const ETAPA_AGUARDANDO_PRIORIZACAO = "Aguardando Priorização";
export const ETAPA_EXECUCAO = "Execução";

/**
 * O que aconteceu com a Etapa do PBI pai depois de alocar uma Task/Bug: quando a alocação deixa
 * TODAS as Tasks/Bugs do PBI com sprint, a Etapa muda de "Aguardando Priorização" pra "Execução".
 * `aviso` só vem quando a Task foi alocada mas a Etapa não pôde ser atualizada.
 */
export type ResultadoEtapaPbi = { pbiId: number; atualizada: boolean; aviso?: string };

/** Capacidade por dev/sprint e teto de esforço de uma Task alocável (decisão do Heder, 2026-10-14). */
export const HORAS_MAX_SPRINT = 60;

export type TaskDoPbi = {
  id: number;
  titulo: string;
  tipo: string;
  state: string;
  iterationPath: string;
  /** Nome da sprint (3º nível do IterationPath) — null se o item está na raiz do projeto (sem sprint). */
  sprint: string | null;
  responsavel: string | null;
  esforco: number | null;
};

export type PbiPriorizacao = {
  id: number;
  titulo: string;
  state: string;
  areaPath: string;
  /** Custom.Cliente do PBI (null se não preenchido). */
  cliente: string | null;
  /** Effort do próprio PBI, em horas (null se não preenchido). */
  esforco: number | null;
  tasks: TaskDoPbi[];
};

/** Sprint = 3º nível do IterationPath ("KMM5\2026\Sprint 8.18"); 1º/2º nível = sem sprint. */
export function sprintDoIterationPath(iterationPath: string): string | null {
  const partes = iterationPath.split("\\");
  return partes.length >= 3 ? partes[2] : null;
}

/**
 * Por que esta Task/Bug NÃO pode ser alocada (null = pode). Regras: só item em Backlog e sem
 * sprint; precisa ter esforço (Effort) cadastrado e não passar de 60h (não cabe em nenhum dev).
 */
export function motivoBloqueioTask(t: Pick<TaskDoPbi, "state" | "sprint" | "esforco">): string | null {
  if (t.state.trim().toLowerCase() !== "backlog") return `Estado "${t.state}" — só itens em Backlog`;
  if (t.sprint) return `Já está na ${t.sprint}`;
  if (t.esforco == null || t.esforco <= 0) return "Sem esforço (Effort) cadastrado";
  if (t.esforco > HORAS_MAX_SPRINT) return `Esforço de ${t.esforco}h, acima de ${HORAS_MAX_SPRINT}h`;
  return null;
}

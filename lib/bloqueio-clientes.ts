/**
 * Regra interna "Bloqueado para novas demandas" (pedido por Heder em 2026-11-24): um cliente fica bloqueado de
 * abrir novas demandas quando chega a 3 demandas em Backlog, OU a 3 em Execução, OU a 3 em HML com cliente.
 * Só regras PURAS (sem fetch) — a verificação diária (JOB) e as telas usam este módulo; o resultado é
 * guardado na tabela ClienteBloqueio e as telas leem de lá (lib/bloqueio-clientes-servidor.ts).
 *
 * Definições (decisões minhas, registradas em docs/decisoes-e-conhecimento.md):
 * - "chegar a 3" = 3 ou mais;
 * - Backlog = a mesma lista "Demandas em backlog" da Gestão de clientes (State Backlog nas etapas Backlog, Análise ou Comitê);
 * - Execução = State Execução (qualquer etapa); HML com cliente = State Teste Aceite Usuário;
 * - conta KMM4 + KMM5 juntos, por cliente (campo Custom.Cliente); "KMM (INTERNO)" e PBI sem cliente ficam de fora;
 * - não há desbloqueio manual: a verificação do dia seguinte recalcula e libera sozinha quem caiu abaixo de 3.
 */
import { CLIENTE_EXCLUIDO_VIABILIDADE } from "./demandas-agregacao";
import { emBacklogDemanda, norm, type PbiGestaoCliente } from "./gestao-clientes";

export const LIMITE_BLOQUEIO = 3;
export const ROTULO_BLOQUEIO = "Bloqueado para novas demandas";

export type MotivoBloqueio = "backlog" | "execucao" | "hml";

export const ROTULO_MOTIVO: Record<MotivoBloqueio, string> = {
  backlog: "Backlog",
  execucao: "Execução",
  hml: "HML com cliente",
};

/** Situação de um cliente na verificação do dia. */
export type BloqueioCliente = {
  cliente: string;
  qtdBacklog: number;
  qtdExecucao: number;
  qtdHml: number;
  bloqueado: boolean;
  motivos: MotivoBloqueio[];
};

/** Situação guardada (e devolvida às telas): a avaliação do cliente + o instante da verificação (ISO). */
export type LinhaBloqueio = BloqueioCliente & { verificadoEm: string };

/** Calcula a situação de cada cliente que tem alguma demanda em Backlog, Execução ou HML. Ordem alfabética. */
export function avaliarBloqueios(itens: readonly PbiGestaoCliente[], limite = LIMITE_BLOQUEIO): BloqueioCliente[] {
  const porCliente = new Map<string, BloqueioCliente>();
  for (const p of itens) {
    const cliente = (p.cliente ?? "").trim();
    if (!cliente || norm(cliente) === norm(CLIENTE_EXCLUIDO_VIABILIDADE)) continue;
    const estado = norm(p.state);
    const campo = emBacklogDemanda(p) ? "qtdBacklog" : estado === "execucao" ? "qtdExecucao" : estado === "teste aceite usuario" ? "qtdHml" : null;
    if (!campo) continue;
    let b = porCliente.get(cliente);
    if (!b) {
      b = { cliente, qtdBacklog: 0, qtdExecucao: 0, qtdHml: 0, bloqueado: false, motivos: [] };
      porCliente.set(cliente, b);
    }
    b[campo] += 1;
  }
  for (const b of porCliente.values()) {
    b.motivos = [
      ...(b.qtdBacklog >= limite ? (["backlog"] as const) : []),
      ...(b.qtdExecucao >= limite ? (["execucao"] as const) : []),
      ...(b.qtdHml >= limite ? (["hml"] as const) : []),
    ];
    b.bloqueado = b.motivos.length > 0;
  }
  return Array.from(porCliente.values()).sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
}

/** "3 demandas em Backlog · 4 em Execução" — só os motivos que causaram o bloqueio. */
export function descreverMotivos(b: Pick<BloqueioCliente, "qtdBacklog" | "qtdExecucao" | "qtdHml" | "motivos">): string {
  const qtd: Record<MotivoBloqueio, number> = { backlog: b.qtdBacklog, execucao: b.qtdExecucao, hml: b.qtdHml };
  return b.motivos
    .map((m, i) => (i === 0 ? `${qtd[m]} ${qtd[m] === 1 ? "demanda" : "demandas"} em ${ROTULO_MOTIVO[m]}` : `${qtd[m]} em ${ROTULO_MOTIVO[m]}`))
    .join(" · ");
}

/** Procura o cliente na lista (sem acento e sem diferença de maiúsculas). */
export function acharBloqueio<T extends { cliente: string }>(lista: readonly T[], cliente: string | null | undefined): T | undefined {
  const alvo = norm(cliente);
  if (!alvo) return undefined;
  return lista.find((b) => norm(b.cliente) === alvo);
}

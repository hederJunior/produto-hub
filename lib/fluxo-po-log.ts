/**
 * Fluxo do PO — linha do log de movimentos (T09), montagem PURA. A gravação na tabela `FluxoPoMovimento` está em
 * lib/fluxo-po-servidor.ts. TODA tentativa entra no log: sucesso, parcial (comentário ou Assesment falhou), bloqueada
 * por regra, sem permissão, conflito de revisão e erro.
 */
import type { Alteracao, EtapaFluxo, ResultadoReplicacao } from "./fluxo-po";

export type ResultadoLog = "sucesso" | "parcial" | "bloqueado" | "sem_permissao" | "conflito" | "erro";

export type LinhaLogMovimento = {
  workItemId: number;
  origem: EtapaFluxo | null;
  destino: string;
  /** "edicao" = edição das informações do PBI na tela de detalhe (T16); "cancelamento" = demanda cancelada pelo detalhe da 1.1. Nenhuma das duas é troca de etapa. */
  direcao: "avanco" | "volta" | "edicao" | "cancelamento" | null;
  proposta: boolean;
  usuario: string;
  usuarioNome: string | null;
  resultado: ResultadoLog;
  /** Motivo do bloqueio/erro (faltas juntas); null no sucesso. */
  motivo: string | null;
  alteracoes: Alteracao[] | null;
  avisos: string[] | null;
  comentarioPublicado: boolean | null;
  comentarioId: number | null;
  comentarioErro: string | null;
  assesments: ResultadoReplicacao | null;
  revisaoAntes: number | null;
};

/** Contexto que o movimento vai descobrindo; serve de base para a linha mesmo quando ele falha no meio. */
export type ContextoLog = {
  workItemId: number | null;
  origem: EtapaFluxo | null;
  destino: string;
  direcao: "avanco" | "volta" | "edicao" | "cancelamento" | null;
  proposta: boolean;
  usuario: string;
  usuarioNome: string | null;
  revisaoAntes: number | null;
  alteracoes: Alteracao[] | null;
};

/** Código do ErroFluxoPo → resultado do log. */
export function resultadoDoErro(codigo: string): ResultadoLog {
  if (codigo === "sem_permissao") return "sem_permissao";
  if (codigo === "conflito") return "conflito";
  if (codigo === "regra" || codigo === "entrada_invalida" || codigo === "fora_do_escopo") return "bloqueado";
  return "erro";
}

function baseDaLinha(ctx: ContextoLog & { workItemId: number }) {
  return {
    workItemId: ctx.workItemId,
    origem: ctx.origem,
    destino: ctx.destino,
    direcao: ctx.direcao,
    proposta: ctx.proposta,
    usuario: ctx.usuario,
    usuarioNome: ctx.usuarioNome,
    revisaoAntes: ctx.revisaoAntes,
  };
}

/** Movimento concluído. "parcial" quando o comentário ou algum Assesment falhou (o PBI foi movido de qualquer jeito). */
export function linhaDeSucesso(
  ctx: ContextoLog & { workItemId: number },
  r: { alteracoes: Alteracao[]; avisos: string[]; comentario: { publicado: boolean; id?: number; erro?: string }; assesments: ResultadoReplicacao | null },
): LinhaLogMovimento {
  const comentarioFalhou = !r.comentario.publicado && r.alteracoes.length > 0;
  const assesmentFalhou = (r.assesments?.falhas.length ?? 0) > 0;
  return {
    ...baseDaLinha(ctx),
    resultado: comentarioFalhou || assesmentFalhou ? "parcial" : "sucesso",
    motivo: null,
    alteracoes: r.alteracoes,
    avisos: r.avisos.length ? r.avisos : null,
    comentarioPublicado: r.alteracoes.length > 0 ? r.comentario.publicado : null,
    comentarioId: r.comentario.id ?? null,
    comentarioErro: r.comentario.erro ?? null,
    assesments: r.assesments,
  };
}

/** Tentativa que não gravou (ou falhou no meio): bloqueada, sem permissão, conflito ou erro. */
export function linhaDeFalha(
  ctx: ContextoLog & { workItemId: number },
  erro: { codigo: string; mensagem: string; faltas?: string[] },
): LinhaLogMovimento {
  return {
    ...baseDaLinha(ctx),
    resultado: resultadoDoErro(erro.codigo),
    motivo: [erro.mensagem, ...(erro.faltas ?? [])].join(" | ").slice(0, 1000),
    alteracoes: null,
    avisos: null,
    comentarioPublicado: null,
    comentarioId: null,
    comentarioErro: null,
    assesments: null,
  };
}

/** Edição das informações do PBI concluída (T16). Não há comentário no PBI; "parcial" só se algum Assesment falhou. */
export function linhaDeEdicao(
  ctx: ContextoLog & { workItemId: number },
  r: { alteracoes: Alteracao[]; avisos: string[]; assesments: ResultadoReplicacao | null; etapaDepois: EtapaFluxo | null },
): LinhaLogMovimento {
  const assesmentFalhou = (r.assesments?.falhas.length ?? 0) > 0;
  return {
    ...baseDaLinha({ ...ctx, direcao: "edicao", destino: r.etapaDepois ?? ctx.destino }),
    resultado: assesmentFalhou ? "parcial" : "sucesso",
    motivo: null,
    alteracoes: r.alteracoes,
    avisos: r.avisos.length ? r.avisos : null,
    comentarioPublicado: null,
    comentarioId: null,
    comentarioErro: null,
    assesments: r.assesments,
  };
}

/** Demanda cancelada pelo detalhe da 1.1: Status → Cancelado. "parcial" se o comentário não foi publicado (o Status já mudou). */
export function linhaDeCancelamento(
  ctx: ContextoLog & { workItemId: number },
  r: { alteracoes: Alteracao[]; avisos: string[]; comentario: { publicado: boolean; id?: number; erro?: string } },
): LinhaLogMovimento {
  return {
    ...baseDaLinha({ ...ctx, direcao: "cancelamento", destino: "Cancelado" }),
    resultado: r.comentario.publicado ? "sucesso" : "parcial",
    motivo: null,
    alteracoes: r.alteracoes,
    avisos: r.avisos.length ? r.avisos : null,
    comentarioPublicado: r.comentario.publicado,
    comentarioId: r.comentario.id ?? null,
    comentarioErro: r.comentario.erro ?? null,
    assesments: null,
  };
}

/**
 * Fluxo do PO — cancelamento de demanda pelo detalhe da etapa 1.1 (SERVIDOR). Publica o comentário (texto padrão do motivo, editado ou
 * não pelo usuário) no PBI e muda o Status do PBI para "Cancelado". Mesma disciplina das demais gravações: permissão no servidor,
 * entrada validada, PBI lido AGORA, PATCH com `test /rev` (conflito = 409), falha do comentário não desfaz o cancelamento (avisa e
 * registra) e TODA tentativa vai para o log (direção "cancelamento").
 */
import {
  ErroFluxoPo,
  aplicarPatchPbi,
  exigirPermissaoMovimento,
  lerPbiFluxoPoAtual,
  publicarComentarioPbi,
  registrarMovimentoNoLog,
  type UsuarioFluxoPo,
} from "./fluxo-po-servidor";
import { avaliarCancelamento, comentarioDeCancelamento, derivarEtapa, motivoDeCancelamento, paraJsonPatch, validarComentario, type Alteracao, type PbiFluxo } from "./fluxo-po";
import { CAMPOS_PBI, STATUS } from "./fluxo-po-campos";
import { linhaDeCancelamento, linhaDeFalha, type ContextoLog, type LinhaLogMovimento } from "./fluxo-po-log";

export type ResultadoCancelamento = {
  alteracoes: Alteracao[];
  /** Comentário no PBI. Falha NÃO desfaz o cancelamento: `publicado: false` + aviso. */
  comentario: { publicado: boolean; id?: number; erro?: string };
  avisos: string[];
  /** O PBI depois de cancelado (Status Cancelado: já não faz parte do quadro). */
  pbi: PbiFluxo;
};

type Params = {
  id: unknown;
  motivo: unknown;
  texto: unknown;
  usuario: UsuarioFluxoPo;
  agora?: Date;
  /** Só para testes. */
  publicador?: (id: number, html: string) => Promise<{ id: number }>;
  registradorLog?: (linha: LinhaLogMovimento) => Promise<boolean>;
};

export async function cancelarDemandaPbi(params: Params): Promise<ResultadoCancelamento> {
  const idNumerico = Number(params.id);
  const ctx: ContextoLog = {
    workItemId: Number.isInteger(idNumerico) && idNumerico > 0 ? idNumerico : null,
    origem: null,
    destino: STATUS.cancelado,
    direcao: "cancelamento",
    proposta: false,
    usuario: params.usuario.email,
    usuarioNome: params.usuario.nome?.trim() || null,
    revisaoAntes: null,
    alteracoes: null,
  };
  const registrar = params.registradorLog ?? registrarMovimentoNoLog;
  try {
    const r = await executar(params, ctx);
    if (ctx.workItemId !== null && !(await registrar(linhaDeCancelamento({ ...ctx, workItemId: ctx.workItemId }, r)))) {
      r.avisos.push("O cancelamento foi feito, mas não foi possível registrá-lo no log da plataforma.");
    }
    return r;
  } catch (e) {
    if (ctx.workItemId !== null) {
      const erro =
        e instanceof ErroFluxoPo
          ? { codigo: e.codigo, mensagem: e.message, faltas: e.faltas }
          : { codigo: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." };
      await registrar(linhaDeFalha({ ...ctx, workItemId: ctx.workItemId }, erro));
    }
    throw e;
  }
}

async function executar(params: Params, ctx: ContextoLog): Promise<ResultadoCancelamento> {
  exigirPermissaoMovimento(params.usuario);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErroFluxoPo(422, "entrada_invalida", "ID do PBI inválido.");
  const motivo = motivoDeCancelamento(params.motivo);
  if (!motivo) throw new ErroFluxoPo(422, "entrada_invalida", "Escolha um dos motivos de cancelamento.");
  const texto = validarComentario(params.texto);
  if (texto.erro !== undefined) throw new ErroFluxoPo(422, "entrada_invalida", texto.erro);

  const pbi = await lerPbiFluxoPoAtual(id);
  if (pbi.rev === undefined) throw new ErroFluxoPo(502, "sem_revisao", "O Azure DevOps não informou a revisão do PBI; nada foi gravado.");
  ctx.revisaoAntes = pbi.rev;
  ctx.origem = derivarEtapa(pbi).etapa;
  const av = avaliarCancelamento(pbi);
  if (!av.permitido) throw new ErroFluxoPo(422, "regra", "Não é possível cancelar esta demanda; nada foi gravado.", av.faltas);

  const alteracoes: Alteracao[] = [{ campo: CAMPOS_PBI.status, rotulo: "Status", de: pbi.status, para: STATUS.cancelado }];
  await aplicarPatchPbi(id, paraJsonPatch(alteracoes, pbi.rev));

  // O Status JÁ mudou: se o comentário falhar, não desfaz — avisa e registra (como no comentário de transição).
  const avisos: string[] = [];
  let comentario: ResultadoCancelamento["comentario"] = { publicado: false };
  try {
    const html = comentarioDeCancelamento({ texto: texto.texto, usuario: params.usuario.nome?.trim() || params.usuario.email, quando: params.agora ?? new Date(), motivo: motivo.rotulo });
    const c = await (params.publicador ?? publicarComentarioPbi)(id, html);
    comentario = { publicado: true, id: c.id };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    comentario = { publicado: false, erro };
    avisos.push(`A demanda foi cancelada (Status Cancelado), mas o comentário não pôde ser publicado no Azure DevOps (${erro}). Publique o texto como comentário no PBI.`);
    console.error(`[fluxo-po] cancelamento do PBI ${id} gravado, comentário falhou:`, e);
  }
  return { alteracoes, comentario, avisos, pbi: await lerPbiFluxoPoAtual(id) };
}

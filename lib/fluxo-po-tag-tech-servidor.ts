/**
 * Fluxo do PO — botão "Necessário análise tech" da etapa 2.1 (SERVIDOR): acrescenta a tag "Pronto para refinamento tech" ao PBI (pedido por
 * Heder em 2026-11-24). Mesma disciplina das demais gravações: permissão no servidor, PBI lido AGORA, só vale com o card na 2.1,
 * PATCH com `test /rev` (conflito = 409) e TODA tentativa vai para o log (direção "tag"). Idempotente: se o PBI já tem a tag, não grava.
 * As outras tags do PBI são preservadas. É a MESMA tag que o fluxo grava ao avançar para a 3.1 (decisão do Heder em 2026-11-25): na 2.1 a Etapa
 * ainda é Comitê, então o card segue na 2.1; ao ir para a 3.2 o fluxo remove a tag, ao ir para a 3.1 ela já está lá (adicionarTag é idempotente).
 */
import {
  ErroFluxoPo,
  aplicarPatchPbi,
  exigirPermissaoMovimento,
  lerPbiFluxoPoAtual,
  registrarMovimentoNoLog,
  type UsuarioFluxoPo,
} from "./fluxo-po-servidor";
import { adicionarTag, derivarEtapa, paraJsonPatch, temTag, type Alteracao, type OperacaoPatch, type PbiFluxo } from "./fluxo-po";
import { CAMPOS_PBI, TAG_PRONTO_REFINAMENTO_TECH } from "./fluxo-po-campos";
import { linhaDeFalha, linhaDeTag, type ContextoLog, type LinhaLogMovimento } from "./fluxo-po-log";

export type EstadoTagTech = { aplicada: boolean };
export type ResultadoTagTech = { aplicada: boolean; jaTinha: boolean; tags: string; alteracoes: Alteracao[]; avisos: string[] };

/** Dependências trocáveis só nos testes. */
export type DependenciasTagTech = {
  lerPbi: (id: number) => Promise<PbiFluxo>;
  aplicarPatch: (id: number, operacoes: OperacaoPatch[]) => Promise<{ rev: number }>;
  registrarLog: (linha: LinhaLogMovimento) => Promise<boolean>;
};

const DEPENDENCIAS_REAIS: DependenciasTagTech = { lerPbi: lerPbiFluxoPoAtual, aplicarPatch: aplicarPatchPbi, registrarLog: registrarMovimentoNoLog };

function validarId(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErroFluxoPo(422, "entrada_invalida", "ID do PBI inválido.");
  return n;
}

/** O PBI já tem a tag? (qualquer usuário logado pode ver.) */
export async function lerTagTech(idBruto: unknown, deps: Partial<DependenciasTagTech> = {}): Promise<EstadoTagTech> {
  const d = { ...DEPENDENCIAS_REAIS, ...deps };
  const pbi = await d.lerPbi(validarId(idBruto));
  return { aplicada: temTag(pbi.tags, TAG_PRONTO_REFINAMENTO_TECH) };
}

export async function marcarNecessarioAnaliseTech(params: { id: unknown; usuario: UsuarioFluxoPo; deps?: Partial<DependenciasTagTech> }): Promise<ResultadoTagTech> {
  const d = { ...DEPENDENCIAS_REAIS, ...params.deps };
  const idNumerico = Number(params.id);
  const ctx: ContextoLog = {
    workItemId: Number.isInteger(idNumerico) && idNumerico > 0 ? idNumerico : null,
    origem: null,
    destino: `Tag "${TAG_PRONTO_REFINAMENTO_TECH}"`,
    direcao: "tag",
    proposta: false,
    usuario: params.usuario.email,
    usuarioNome: params.usuario.nome?.trim() || null,
    revisaoAntes: null,
    alteracoes: null,
  };
  try {
    const r = await executar(params.usuario, params.id, d, ctx);
    if (ctx.workItemId !== null && !(await d.registrarLog(linhaDeTag({ ...ctx, workItemId: ctx.workItemId }, r)))) {
      r.avisos.push("A tag foi aplicada, mas não foi possível gravá-la no log da plataforma.");
    }
    return r;
  } catch (e) {
    if (ctx.workItemId !== null) {
      const erro =
        e instanceof ErroFluxoPo ? { codigo: e.codigo, mensagem: e.message, faltas: e.faltas } : { codigo: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." };
      await d.registrarLog(linhaDeFalha({ ...ctx, workItemId: ctx.workItemId }, erro));
    }
    throw e;
  }
}

async function executar(usuario: UsuarioFluxoPo, idBruto: unknown, d: DependenciasTagTech, ctx: ContextoLog): Promise<ResultadoTagTech> {
  exigirPermissaoMovimento(usuario);
  const id = validarId(idBruto);
  const pbi = await d.lerPbi(id);
  if (pbi.rev === undefined) throw new ErroFluxoPo(502, "sem_revisao", "O Azure DevOps não informou a revisão do PBI; nada foi gravado.");
  ctx.revisaoAntes = pbi.rev;
  ctx.origem = derivarEtapa(pbi).etapa;
  if (ctx.origem !== "2.1") throw new ErroFluxoPo(422, "regra", "Este botão só vale enquanto o card está na etapa 2.1 (Comitê / Proposta de solução); nada foi gravado.");

  if (temTag(pbi.tags, TAG_PRONTO_REFINAMENTO_TECH)) {
    return { aplicada: true, jaTinha: true, tags: pbi.tags, alteracoes: [], avisos: [`O PBI já tem a tag "${TAG_PRONTO_REFINAMENTO_TECH}"; nada foi alterado.`] };
  }
  const novaTags = adicionarTag(pbi.tags, TAG_PRONTO_REFINAMENTO_TECH);
  const alteracoes: Alteracao[] = [{ campo: CAMPOS_PBI.tags, rotulo: "Tags", de: pbi.tags || null, para: novaTags }];
  await d.aplicarPatch(id, paraJsonPatch(alteracoes, pbi.rev));
  const depois = await d.lerPbi(id);
  return { aplicada: temTag(depois.tags, TAG_PRONTO_REFINAMENTO_TECH), jaTinha: false, tags: depois.tags, alteracoes, avisos: [] };
}

/**
 * Fluxo do PO — gravação no Azure DevOps (SERVIDOR). Única parte do fluxo que escreve em PBIs.
 * As regras vêm de `lib/fluxo-po.ts` (puras e testadas); aqui só há I/O: ler o PBI agora, validar, gravar com
 * controle de revisão e devolver o card atualizado. Nada é gravado quando uma regra falha.
 */
import { API_VERSION, authHeader, buscarLoteCampos, getConfig, pbiFluxoDeWorkItem } from "./devops-client";
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase";
import { linhaDeEdicao, linhaDeFalha, linhaDeSucesso, type ContextoLog, type LinhaLogMovimento } from "./fluxo-po-log";
import { lerListasDeValores, type ListasFluxoPo } from "./fluxo-po-listas-servidor";
import {
  ETAPAS_FLUXO,
  avaliarEdicao,
  avaliarMovimento,
  avisosDaReplicacao,
  comentarioDeTransicao,
  detectarConflitoDeEdicao,
  derivarEtapa,
  idsFilhosDeRelacoes,
  lerEntradaMovimento,
  montarCards,
  paraJsonPatch,
  permissaoDoFluxo,
  projetoSuportado,
  replicarDataComite,
  traduzirErroAzure,
  type Alteracao,
  type CardFluxo,
  type EtapaFluxo,
  type OperacaoPatch,
  type PbiFluxo,
  type ResultadoReplicacao,
} from "./fluxo-po";
import { CAMPOS_ASSESMENT, CAMPOS_LEITURA_PBI, CAMPOS_PBI, PROJETO_FLUXO_PO, TIPO_ASSESMENT, TIPO_PBI } from "./fluxo-po-campos";

/** Erro com o status HTTP que a rota deve devolver e uma mensagem segura (sem URL interna nem credencial). */
export class ErroFluxoPo extends Error {
  status: number;
  codigo: string;
  faltas: string[];
  constructor(status: number, codigo: string, mensagem: string, faltas: string[] = []) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.faltas = faltas;
  }
}

export type UsuarioFluxoPo = { email: string; nome?: string | null; tipo: string; papel: string | null };

export type ResultadoMover = {
  origem: EtapaFluxo | null;
  destino: EtapaFluxo;
  direcao: "avanco" | "volta" | null;
  /** A regra da volta ainda é proposta a validar com o Heder. */
  proposta: boolean;
  /** O que foi gravado no PBI. */
  alteracoes: Alteracao[];
  /** Card atualizado (releitura após gravar), para a tela atualizar sem recarregar o quadro. */
  card: CardFluxo | null;
  /** Replicação da Data Comitê nos Assesments filhos (T07); null quando o movimento não grava a Data Comitê. */
  assesments: ResultadoReplicacao | null;
  /** Comentário de transição no PBI (T06). Falha NÃO desfaz o movimento: `publicado: false` + aviso. */
  comentario: { publicado: boolean; id?: number; erro?: string };
  /** Avisos que não impediram o movimento (proposta de volta, falha de comentário, PBI sem Assesment...). */
  avisos: string[];
};

/** Publica um comentário no PBI (API de comentários 7.1-preview.4). O autor no Azure é o dono do PAT. */
export async function publicarComentarioPbi(id: number, html: string): Promise<{ id: number }> {
  const { org, pat } = getConfig();
  const res = await fetch(`${urlComentarios(org, id)}?api-version=7.1-preview.4`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(pat) },
    body: JSON.stringify({ text: html }),
    cache: "no-store",
  });
  const corpo = await res.text();
  if (!res.ok) {
    console.error(`[fluxo-po] comentário no PBI ${id} falhou (${res.status}):`, corpo.slice(0, 500));
    const e = traduzirErroAzure(res.status, corpo);
    throw new ErroFluxoPo(e.status, e.codigo, e.mensagem);
  }
  return { id: (JSON.parse(corpo) as { id: number }).id };
}

/** Assesments FILHOS do PBI (relação Hierarchy-Forward) com a Data Comitê atual de cada um. Sentido inverso é ignorado. */
export async function listarAssesmentsFilhos(pbiId: number): Promise<{ id: number; dataComite: string | null }[]> {
  const { org, pat } = getConfig();
  const res = await fetch(`${urlItem(org, pbiId)}?$expand=relations&api-version=${API_VERSION}`, { headers: authHeader(pat), cache: "no-store" });
  const corpo = await res.text();
  if (!res.ok) {
    const e = traduzirErroAzure(res.status, corpo);
    throw new ErroFluxoPo(e.status, e.codigo, e.mensagem);
  }
  const ids = idsFilhosDeRelacoes((JSON.parse(corpo) as { relations?: { rel?: string; url?: string }[] }).relations);
  if (!ids.length) return [];
  const itens = await buscarLoteCampos(org, pat, ids, ["System.WorkItemType", CAMPOS_ASSESMENT.dataComite]);
  return itens
    .filter((w) => String(w.fields["System.WorkItemType"] ?? "").toLowerCase() === TIPO_ASSESMENT.toLowerCase())
    .map((w) => ({ id: w.id, dataComite: (w.fields[CAMPOS_ASSESMENT.dataComite] as string) ?? null }))
    .sort((a, b) => a.id - b.id);
}

/** Grava a Data Comitê em UM Assesment (só esse campo). */
export async function gravarDataComiteAssesment(id: number, dataComite: string): Promise<void> {
  const { org, pat } = getConfig();
  const res = await fetch(`https://dev.azure.com/${org}/_apis/wit/workitems/${id}?api-version=${API_VERSION}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json", ...authHeader(pat) },
    body: JSON.stringify([{ op: "add", path: `/fields/${CAMPOS_ASSESMENT.dataComite}`, value: dataComite }]),
    cache: "no-store",
  });
  const corpo = await res.text();
  if (!res.ok) {
    console.error(`[fluxo-po] Data Comitê do Assesment ${id} falhou (${res.status}):`, corpo.slice(0, 500));
    throw new Error(traduzirErroAzure(res.status, corpo).mensagem);
  }
}

/** Replica a Data Comitê do PBI em todos os Assesments filhos (falha de um não impede os outros). */
export async function replicarDataComiteNosAssesments(
  pbiId: number,
  dataComite: string,
  gravar: (id: number, dataComite: string) => Promise<void> = gravarDataComiteAssesment,
): Promise<ResultadoReplicacao> {
  const filhos = await listarAssesmentsFilhos(pbiId);
  return replicarDataComite({ filhos, dataComite, gravar });
}

/** Apaga um comentário (uso restrito a scripts de teste, para limpar o PBI de teste). */
export async function apagarComentarioPbi(id: number, comentarioId: number): Promise<void> {
  const { org, pat } = getConfig();
  const res = await fetch(`${urlComentarios(org, id)}/${comentarioId}?api-version=7.1-preview.4`, {
    method: "DELETE",
    headers: authHeader(pat),
  });
  if (!res.ok) throw new Error(`Falha ao apagar o comentário ${comentarioId} do PBI ${id} (HTTP ${res.status}).`);
}

const CAMPOS_PEDIDOS = [...CAMPOS_LEITURA_PBI.filter((c) => c !== "System.Id"), "System.WorkItemType", "System.TeamProject"];

function urlComentarios(org: string, id: number): string {
  return `https://dev.azure.com/${org}/${encodeURIComponent(PROJETO_FLUXO_PO)}/_apis/wit/workItems/${id}/comments`;
}

function urlItem(org: string, id: number): string {
  return `https://dev.azure.com/${org}/${encodeURIComponent(PROJETO_FLUXO_PO)}/_apis/wit/workitems/${id}`;
}

/** Lê o PBI AGORA no Azure (com a revisão atual) e confere que é um PBI do KMM5. */
export async function lerPbiFluxoPoAtual(id: number): Promise<PbiFluxo> {
  const { org, pat } = getConfig();
  const res = await fetch(`${urlItem(org, id)}?fields=${CAMPOS_PEDIDOS.map(encodeURIComponent).join(",")}&api-version=${API_VERSION}`, {
    headers: authHeader(pat),
    cache: "no-store",
  });
  const corpo = await res.text();
  if (!res.ok) {
    const e = traduzirErroAzure(res.status, corpo);
    throw new ErroFluxoPo(e.status, e.codigo, e.mensagem);
  }
  const w = JSON.parse(corpo) as { id: number; rev?: number; fields: Record<string, unknown> };
  const tipo = String(w.fields["System.WorkItemType"] ?? "");
  const projeto = String(w.fields["System.TeamProject"] ?? "");
  if (tipo !== TIPO_PBI || !projetoSuportado(projeto)) {
    throw new ErroFluxoPo(422, "fora_do_escopo", `O item ${id} não é um Product Backlog Item do ${PROJETO_FLUXO_PO}; o Fluxo do PO só vale para eles.`);
  }
  return pbiFluxoDeWorkItem(w);
}

/** PATCH json-patch no PBI. Erros do Azure viram ErroFluxoPo em português (conflito de revisão = 409). */
export async function aplicarPatchPbi(id: number, operacoes: OperacaoPatch[]): Promise<{ rev: number }> {
  const { org, pat } = getConfig();
  const res = await fetch(`${urlItem(org, id)}?api-version=${API_VERSION}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json", ...authHeader(pat) },
    body: JSON.stringify(operacoes),
    cache: "no-store",
  });
  const corpo = await res.text();
  if (!res.ok) {
    console.error(`[fluxo-po] PATCH do PBI ${id} falhou (${res.status}):`, corpo.slice(0, 500));
    const e = traduzirErroAzure(res.status, corpo);
    throw new ErroFluxoPo(e.status, e.codigo, e.mensagem);
  }
  return { rev: (JSON.parse(corpo) as { rev: number }).rev };
}

/**
 * Move um PBI de etapa. Ordem (cada passo só roda se o anterior passou):
 * permissão → entrada válida → lê o PBI agora → regras (`avaliarMovimento`) → PATCH com `test /rev` → relê e monta o card.
 * Lança ErroFluxoPo: 403 sem permissão, 422 entrada/regra, 404 PBI inexistente, 409 PBI mudou desde a leitura, 502 Azure.
 */
export async function moverPbiFluxoPo(params: ParamsMover): Promise<ResultadoMover> {
  const idNumerico = Number(params.id);
  const ctx: ContextoLog = {
    workItemId: Number.isInteger(idNumerico) && idNumerico > 0 ? idNumerico : null,
    origem: null,
    destino: String(params.destino ?? ""),
    direcao: null,
    proposta: false,
    usuario: params.usuario.email,
    usuarioNome: params.usuario.nome?.trim() || null,
    revisaoAntes: null,
    alteracoes: null,
  };
  const registrar = params.registradorLog ?? registrarMovimentoNoLog;

  try {
    const resultado = await executarMovimento(params, ctx);
    // T09: log de TODA tentativa. Falha no log não desfaz nada: vira aviso (e console.error dentro de registrarMovimentoNoLog).
    if (ctx.workItemId !== null && !(await registrar(linhaDeSucesso({ ...ctx, workItemId: ctx.workItemId }, resultado)))) {
      resultado.avisos.push("O movimento foi feito, mas não foi possível registrá-lo no log da plataforma.");
    }
    return resultado;
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

/**
 * Verificação de permissão do Fluxo do PO NO SERVIDOR — chamar no início de TODA gravação (mover cards, marcar checklist...).
 * Lança ErroFluxoPo 403 com o motivo quando o perfil só visualiza.
 */
export function exigirPermissaoMovimento(usuario: Pick<UsuarioFluxoPo, "papel" | "tipo">): void {
  const { pode, motivo } = permissaoDoFluxo(usuario.papel, usuario.tipo);
  if (!pode) throw new ErroFluxoPo(403, "sem_permissao", motivo ?? "Seu perfil só permite visualizar o Fluxo do PO.");
}

/** Grava uma linha no log de movimentos (tabela FluxoPoMovimento). Devolve false se falhar — nunca lança. */
export async function registrarMovimentoNoLog(linha: LinhaLogMovimento): Promise<boolean> {
  try {
    // O `id` é gerado AQUI: o @default(uuid()) do Prisma vale só no cliente dele; no banco a coluna não tem default.
    const { error } = await getServiceClient().from("FluxoPoMovimento").insert({ id: randomUUID(), ...linha });
    if (error) {
      console.error("[fluxo-po] não foi possível gravar no log de movimentos:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[fluxo-po] não foi possível gravar no log de movimentos:", e);
    return false;
  }
}

type ParamsMover = {
  id: unknown;
  destino: unknown;
  entrada?: unknown;
  usuario: UsuarioFluxoPo;
  agora?: Date;
  /** Só para testes: substitui a publicação do comentário (ex.: simular falha). */
  publicador?: (id: number, html: string) => Promise<{ id: number }>;
  /** Só para testes: substitui a gravação da Data Comitê em um Assesment (ex.: simular falha parcial). */
  gravadorAssesment?: (id: number, dataComite: string) => Promise<void>;
  /** Só para testes: substitui a gravação no log (devolve true se gravou). */
  registradorLog?: (linha: LinhaLogMovimento) => Promise<boolean>;
};

/** O movimento em si; preenche `ctx` conforme descobre as coisas, para o log mesmo quando falha no meio. */
async function executarMovimento(params: ParamsMover, ctx: ContextoLog): Promise<ResultadoMover> {
  const { usuario } = params;
  exigirPermissaoMovimento(usuario);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErroFluxoPo(422, "entrada_invalida", "ID do PBI inválido.");
  const destino = String(params.destino ?? "") as EtapaFluxo;
  if (!ETAPAS_FLUXO.some((e) => e.codigo === destino)) throw new ErroFluxoPo(422, "entrada_invalida", "Etapa de destino inválida.");
  const lida = lerEntradaMovimento(params.entrada);
  if (lida.erro) throw new ErroFluxoPo(422, "entrada_invalida", lida.erro);

  const pbi = await lerPbiFluxoPoAtual(id);
  if (pbi.rev === undefined) throw new ErroFluxoPo(502, "sem_revisao", "O Azure DevOps não informou a revisão do PBI; nada foi gravado.");
  ctx.revisaoAntes = pbi.rev;

  const avaliacao = avaliarMovimento(pbi, destino, lida.entrada);
  ctx.origem = avaliacao.origem;
  ctx.direcao = avaliacao.direcao;
  ctx.proposta = avaliacao.proposta;
  if (!avaliacao.permitido) {
    throw new ErroFluxoPo(422, "regra", "O movimento não cumpre as regras do fluxo; nada foi gravado.", avaliacao.faltas);
  }

  const avisos = [...avaliacao.avisos];
  let comentario: ResultadoMover["comentario"] = { publicado: false };
  if (avaliacao.alteracoes.length) {
    await aplicarPatchPbi(id, paraJsonPatch(avaliacao.alteracoes, pbi.rev));

    // T06: comentário de transição. O PBI JÁ foi movido — se o comentário falhar, não desfaz: avisa e registra.
    try {
      const html = comentarioDeTransicao({
        origem: avaliacao.origem!,
        destino,
        usuario: usuario.nome?.trim() || usuario.email,
        quando: params.agora ?? new Date(),
        direcao: avaliacao.direcao ?? undefined,
      });
      const c = await (params.publicador ?? publicarComentarioPbi)(id, html);
      comentario = { publicado: true, id: c.id };
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      comentario = { publicado: false, erro };
      avisos.push(`O PBI foi movido, mas o comentário de transição não pôde ser publicado no Azure DevOps (${erro}).`);
      console.error(`[fluxo-po] movimento do PBI ${id} gravado, comentário falhou:`, e);
    }
  }

  const atualizado = await lerPbiFluxoPoAtual(id);

  // T07: Data Comitê do PBI → TODOS os Assesments filhos (também sempre que este movimento grava a Data Comitê).
  // O PBI já foi movido: sem filho avisa e segue; falha (total ou parcial) não reverte, devolve a lista e registra.
  let assesments: ResultadoReplicacao | null = null;
  const gravouDataComite = avaliacao.alteracoes.some((a) => a.campo === CAMPOS_PBI.dataComite);
  if ((avaliacao.replicarDataComiteAssesments || gravouDataComite) && atualizado.dataComite) {
    try {
      assesments = await replicarDataComiteNosAssesments(id, atualizado.dataComite, params.gravadorAssesment);
      avisos.push(...avisosDaReplicacao(assesments));
      if (assesments.falhas.length) console.error(`[fluxo-po] PBI ${id}: Data Comitê não replicada em`, assesments.falhas);
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      avisos.push(`O PBI foi movido, mas não foi possível replicar a Data Comitê nos Assesments (${erro}).`);
      console.error(`[fluxo-po] PBI ${id}: falha ao listar/replicar nos Assesments:`, e);
    }
  }

  return {
    origem: avaliacao.origem,
    destino,
    direcao: avaliacao.direcao,
    proposta: avaliacao.proposta,
    alteracoes: avaliacao.alteracoes,
    card: montarCards([atualizado])[0] ?? null,
    assesments,
    comentario,
    avisos,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Tela de detalhe (T16): ler as informações do PBI e editá-las
// ---------------------------------------------------------------------------------------------------------------

export type InformacoesPbi = {
  pbi: PbiFluxo;
  /** Card do PBI no quadro (etapa derivada, prontidão, inconsistência); null quando o PBI não faz parte do fluxo. */
  card: CardFluxo | null;
  listas: ListasFluxoPo;
};

/** PBI + card + listas de valores do Azure para o detalhe. Qualquer usuário logado lê. */
export async function lerInformacoesPbi(idBruto: unknown): Promise<InformacoesPbi> {
  const id = Number(idBruto);
  if (!Number.isInteger(id) || id <= 0) throw new ErroFluxoPo(422, "entrada_invalida", "ID do PBI inválido.");
  const [pbi, listas] = await Promise.all([lerPbiFluxoPoAtual(id), lerListasDeValores()]);
  return { pbi, card: montarCards([pbi])[0] ?? null, listas };
}

export type ResultadoEdicaoPbi = {
  /** Nada mudou em relação ao que já está no PBI: nada foi gravado. */
  semMudancas: boolean;
  alteracoes: Alteracao[];
  pbi: PbiFluxo;
  card: CardFluxo | null;
  assesments: ResultadoReplicacao | null;
  avisos: string[];
};

type ParamsEdicao = {
  id: unknown;
  entrada: unknown;
  /** Valores que a tela mostrava ao abrir (dos campos editados): se mudaram no Azure, a edição é recusada com 409 (T19). */
  base?: unknown;
  usuario: UsuarioFluxoPo;
  /** Só para testes. */
  gravadorAssesment?: (id: number, dataComite: string) => Promise<void>;
  registradorLog?: (linha: LinhaLogMovimento) => Promise<boolean>;
};

/**
 * Edita as informações do PBI (Cliente, Classificação, Area Path, Data Abertura Produto, Data Comitê). Mesma disciplina do
 * movimento: permissão no servidor → entrada válida → lê o PBI agora → `avaliarEdicao` (422 com as faltas) → PATCH com
 * `test /rev` → relê → se a Data Comitê ganhou valor, copia para os Assesments filhos (falha não reverte). Sem comentário no PBI
 * (só troca de etapa comenta). TODA tentativa vai para o log (direção "edicao"), porque no histórico do Azure a edição aparece
 * como feita pelo dono do PAT, não pelo usuário.
 */
export async function editarInformacoesPbi(params: ParamsEdicao): Promise<ResultadoEdicaoPbi> {
  const idNumerico = Number(params.id);
  const ctx: ContextoLog = {
    workItemId: Number.isInteger(idNumerico) && idNumerico > 0 ? idNumerico : null,
    origem: null,
    destino: "-",
    direcao: "edicao",
    proposta: false,
    usuario: params.usuario.email,
    usuarioNome: params.usuario.nome?.trim() || null,
    revisaoAntes: null,
    alteracoes: null,
  };
  const registrar = params.registradorLog ?? registrarMovimentoNoLog;
  try {
    const resultado = await executarEdicao(params, ctx);
    if (!resultado.semMudancas && ctx.workItemId !== null) {
      const ok = await registrar(linhaDeEdicao({ ...ctx, workItemId: ctx.workItemId }, { ...resultado, etapaDepois: resultado.card?.etapa ?? null }));
      if (!ok) resultado.avisos.push("A edição foi feita, mas não foi possível registrá-la no log da plataforma.");
    }
    return resultado;
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

async function executarEdicao(params: ParamsEdicao, ctx: ContextoLog): Promise<ResultadoEdicaoPbi> {
  exigirPermissaoMovimento(params.usuario);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErroFluxoPo(422, "entrada_invalida", "ID do PBI inválido.");
  const lida = lerEntradaMovimento(params.entrada);
  if (lida.erro) throw new ErroFluxoPo(422, "entrada_invalida", lida.erro);
  if (!Object.keys(lida.entrada).length) throw new ErroFluxoPo(422, "entrada_invalida", "Nenhum campo foi informado.");

  const pbi = await lerPbiFluxoPoAtual(id);
  if (pbi.rev === undefined) throw new ErroFluxoPo(502, "sem_revisao", "O Azure DevOps não informou a revisão do PBI; nada foi gravado.");
  ctx.revisaoAntes = pbi.rev;
  ctx.origem = derivarEtapa(pbi).etapa;
  ctx.destino = ctx.origem ?? "-";
  if (!ctx.origem) throw new ErroFluxoPo(422, "fora_do_escopo", "Este PBI não está em nenhuma etapa do Fluxo do PO; as informações dele não são editadas por aqui.");

  // T19: outra pessoa mexeu, no Azure, num campo que este usuário está editando? Não sobrescreve em silêncio.
  const lidaBase = params.base === undefined || params.base === null ? { entrada: undefined, erro: undefined } : lerEntradaMovimento(params.base);
  if (lidaBase.erro) throw new ErroFluxoPo(422, "entrada_invalida", lidaBase.erro);
  const conflitos = detectarConflitoDeEdicao(pbi, lida.entrada, lidaBase.entrada);
  if (conflitos.length) {
    throw new ErroFluxoPo(
      409,
      "conflito",
      "Outra pessoa alterou, no Azure DevOps, campo(s) que você está editando. Nada foi gravado. Atualize a tela e confira os valores atuais.",
      conflitos.map((c) => `${c.rotulo}: agora está "${c.atual}" (você viu "${c.visto}")`),
    );
  }

  const av = avaliarEdicao(pbi, lida.entrada);
  if (!av.permitido) throw new ErroFluxoPo(422, "regra", "Há valores inválidos; nada foi gravado.", av.faltas);
  if (!av.alteracoes.length) return { semMudancas: true, alteracoes: [], pbi, card: montarCards([pbi])[0] ?? null, assesments: null, avisos: ["Nada mudou: os valores informados já são os do PBI."] };

  await aplicarPatchPbi(id, paraJsonPatch(av.alteracoes, pbi.rev));
  const atualizado = await lerPbiFluxoPoAtual(id);
  const avisos = [...av.avisos];

  // Data Comitê ganhou valor: copia para os Assesments filhos (o PBI já foi gravado — falha não reverte, só avisa).
  let assesments: ResultadoReplicacao | null = null;
  if (av.replicarDataComiteAssesments && atualizado.dataComite) {
    try {
      assesments = await replicarDataComiteNosAssesments(id, atualizado.dataComite, params.gravadorAssesment);
      avisos.push(...avisosDaReplicacao(assesments));
      if (assesments.falhas.length) console.error(`[fluxo-po] PBI ${id}: Data Comitê não replicada em`, assesments.falhas);
    } catch (e) {
      avisos.push(`As informações foram gravadas, mas não foi possível replicar a Data Comitê nos Assesments (${e instanceof Error ? e.message : String(e)}).`);
      console.error(`[fluxo-po] PBI ${id}: falha ao replicar a Data Comitê:`, e);
    }
  }
  return { semMudancas: false, alteracoes: av.alteracoes, pbi: atualizado, card: montarCards([atualizado])[0] ?? null, assesments, avisos };
}

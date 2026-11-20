/**
 * Fluxo do PO — gravação no Azure DevOps (SERVIDOR). Única parte do fluxo que escreve em PBIs.
 * As regras vêm de `lib/fluxo-po.ts` (puras e testadas); aqui só há I/O: ler o PBI agora, validar, gravar com
 * controle de revisão e devolver o card atualizado. Nada é gravado quando uma regra falha.
 */
import { API_VERSION, authHeader, getConfig, pbiFluxoDeWorkItem } from "./devops-client";
import {
  ETAPAS_FLUXO,
  avaliarMovimento,
  comentarioDeTransicao,
  lerEntradaMovimento,
  montarCards,
  paraJsonPatch,
  podeMovimentar,
  projetoSuportado,
  traduzirErroAzure,
  type Alteracao,
  type CardFluxo,
  type EtapaFluxo,
  type OperacaoPatch,
  type PbiFluxo,
} from "./fluxo-po";
import { CAMPOS_LEITURA_PBI, PROJETO_FLUXO_PO, TIPO_PBI } from "./fluxo-po-campos";

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
export async function moverPbiFluxoPo(params: {
  id: unknown;
  destino: unknown;
  entrada?: unknown;
  usuario: UsuarioFluxoPo;
  agora?: Date;
  /** Só para testes: substitui a publicação do comentário (ex.: simular falha). */
  publicador?: (id: number, html: string) => Promise<{ id: number }>;
}): Promise<ResultadoMover> {
  const { usuario } = params;
  if (!podeMovimentar(usuario.papel, usuario.tipo)) {
    throw new ErroFluxoPo(403, "sem_permissao", "Seu perfil só permite visualizar o Fluxo do PO. Peça a um PM, PO, GPM, Product Ops ou administrador.");
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErroFluxoPo(422, "entrada_invalida", "ID do PBI inválido.");
  const destino = String(params.destino ?? "") as EtapaFluxo;
  if (!ETAPAS_FLUXO.some((e) => e.codigo === destino)) throw new ErroFluxoPo(422, "entrada_invalida", "Etapa de destino inválida.");
  const lida = lerEntradaMovimento(params.entrada);
  if (lida.erro) throw new ErroFluxoPo(422, "entrada_invalida", lida.erro);

  const pbi = await lerPbiFluxoPoAtual(id);
  if (pbi.rev === undefined) throw new ErroFluxoPo(502, "sem_revisao", "O Azure DevOps não informou a revisão do PBI; nada foi gravado.");

  const avaliacao = avaliarMovimento(pbi, destino, lida.entrada);
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
  return {
    origem: avaliacao.origem,
    destino,
    direcao: avaliacao.direcao,
    proposta: avaliacao.proposta,
    alteracoes: avaliacao.alteracoes,
    card: montarCards([atualizado])[0] ?? null,
    comentario,
    avisos,
  };
}

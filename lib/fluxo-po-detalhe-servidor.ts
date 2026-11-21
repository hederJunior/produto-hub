/**
 * Fluxo do PO — leitura do detalhe de um PBI (T08, SOMENTE LEITURA): descrição, comentários, anexos e histórico.
 * HTML vindo do Azure (descrição e comentários) é sanitizado por lib/html-seguro.ts antes de sair daqui.
 * Limites: 100 comentários, 100 anexos e 500 revisões por PBI (acima disso `truncado: true`).
 */
import { API_VERSION, authHeader, getConfig } from "./devops-client";
import { ErroFluxoPo, exigirPermissaoMovimento, lerPbiFluxoPoAtual, publicarComentarioPbi, type UsuarioFluxoPo } from "./fluxo-po-servidor";
import { comentarioDoUsuario, traduzirErroAzure, projetoSuportado, validarComentario } from "./fluxo-po";
import { getServiceClient } from "./supabase";
import { PROJETO_FLUXO_PO, TIPO_PBI } from "./fluxo-po-campos";
import { montarAnexos, montarHistorico, montarMovimentos, type AnexoPbi, type EntradaHistorico, type LinhaMovimento, type MovimentoPbi, type RelacaoAzure, type UpdateAzure } from "./fluxo-po-detalhe";
import { sanitizarHtml } from "./html-seguro";

const MAX_COMENTARIOS = 100;
const MAX_ANEXOS = 100;
const MAX_REVISOES = 500;
const TAMANHO_PAGINA_REVISOES = 200;

export type DescricaoPbi = { html: string; vazia: boolean; truncada: boolean };
export type ComentarioPbi = { id: number; autor: string; quando: string | null; editadoEm: string | null; html: string };
export type ComentariosPbi = { total: number; comentarios: ComentarioPbi[]; truncado: boolean };
export type AnexosPbi = { anexos: AnexoPbi[]; truncado: boolean };
export type HistoricoPbi = { entradas: EntradaHistorico[]; truncado: boolean };

const baseProjeto = (org: string) => `https://dev.azure.com/${org}/${encodeURIComponent(PROJETO_FLUXO_PO)}/_apis/wit`;

/** GET no Azure; erro vira ErroFluxoPo em português (corpo cru não sai daqui). */
async function azureGet<T>(url: string): Promise<T> {
  const { pat } = getConfig();
  const res = await fetch(url, { headers: authHeader(pat), cache: "no-store" });
  const corpo = await res.text();
  if (!res.ok) {
    console.error(`[fluxo-po/detalhe] GET falhou (${res.status}):`, corpo.slice(0, 300));
    const e = traduzirErroAzure(res.status, corpo);
    throw new ErroFluxoPo(e.status, e.codigo, e.mensagem);
  }
  return JSON.parse(corpo) as T;
}

function validarId(id: unknown): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ErroFluxoPo(422, "entrada_invalida", "ID do PBI inválido.");
  return n;
}

/** Confere que o item é um PBI do KMM5 (o fluxo só vale para eles) e devolve o work item pedido. */
async function lerItemDoEscopo(id: number, query: string): Promise<{ fields: Record<string, unknown>; relations?: RelacaoAzure[] }> {
  const { org } = getConfig();
  const item = await azureGet<{ fields: Record<string, unknown>; relations?: RelacaoAzure[] }>(`${baseProjeto(org)}/workitems/${id}?${query}api-version=${API_VERSION}`);
  const tipo = String(item.fields["System.WorkItemType"] ?? "");
  const projeto = String(item.fields["System.TeamProject"] ?? "");
  if (tipo !== TIPO_PBI || !projetoSuportado(projeto)) {
    throw new ErroFluxoPo(422, "fora_do_escopo", `O item ${id} não é um Product Backlog Item do ${PROJETO_FLUXO_PO}.`);
  }
  return item;
}

const CAMPOS_ESCOPO = "System.WorkItemType,System.TeamProject";

export async function lerDescricaoPbi(idBruto: unknown): Promise<DescricaoPbi> {
  const id = validarId(idBruto);
  const item = await lerItemDoEscopo(id, `fields=${CAMPOS_ESCOPO},System.Description&`);
  const { html, truncado } = sanitizarHtml(String(item.fields["System.Description"] ?? ""));
  return { html, vazia: html.replace(/<[^>]*>|&nbsp;|\s/g, "") === "", truncada: truncado };
}

export async function lerComentariosPbi(idBruto: unknown): Promise<ComentariosPbi> {
  const id = validarId(idBruto);
  await lerItemDoEscopo(id, `fields=${CAMPOS_ESCOPO}&`);
  const { org } = getConfig();
  type Pagina = {
    totalCount?: number;
    comments?: { id: number; text?: string; createdBy?: { displayName?: string }; createdDate?: string; modifiedDate?: string; version?: number }[];
    continuationToken?: string | null;
  };
  const comentarios: ComentarioPbi[] = [];
  let total = 0;
  let token: string | null | undefined = null;
  let truncado = false;
  for (let pagina = 0; pagina < 3 && comentarios.length < MAX_COMENTARIOS; pagina++) {
    const url: string =
      `${baseProjeto(org)}/workItems/${id}/comments?$top=50&order=desc&api-version=7.1-preview.4` +
      (token ? `&continuationToken=${encodeURIComponent(token)}` : "");
    const r: Pagina = await azureGet<Pagina>(url);
    total = r.totalCount ?? total;
    for (const c of r.comments ?? []) {
      if (comentarios.length >= MAX_COMENTARIOS) {
        truncado = true;
        break;
      }
      comentarios.push({
        id: c.id,
        autor: c.createdBy?.displayName ?? "(desconhecido)",
        quando: c.createdDate ?? null,
        editadoEm: c.modifiedDate && c.modifiedDate !== c.createdDate && (c.version ?? 1) > 1 ? c.modifiedDate : null,
        html: sanitizarHtml(c.text ?? "").html,
      });
    }
    token = r.continuationToken;
    if (!token) break;
  }
  return { total, comentarios, truncado: truncado || comentarios.length < total };
}

/** Revisões do PBI (`/updates`: só o que mudou em cada uma), paginadas até MAX_REVISOES. */
async function lerUpdates(id: number): Promise<{ updates: UpdateAzure[]; truncado: boolean }> {
  const { org } = getConfig();
  const updates: UpdateAzure[] = [];
  let truncado = false;
  for (let skip = 0; skip < MAX_REVISOES; skip += TAMANHO_PAGINA_REVISOES) {
    const r = await azureGet<{ value?: UpdateAzure[] }>(
      `${baseProjeto(org)}/workItems/${id}/updates?$top=${TAMANHO_PAGINA_REVISOES}&$skip=${skip}&api-version=${API_VERSION}`,
    );
    const lote = r.value ?? [];
    updates.push(...lote);
    if (lote.length < TAMANHO_PAGINA_REVISOES) return { updates, truncado };
  }
  truncado = true;
  return { updates, truncado };
}

export async function lerAnexosPbi(idBruto: unknown): Promise<AnexosPbi> {
  const id = validarId(idBruto);
  const item = await lerItemDoEscopo(id, `$expand=relations&`);
  const relacoes = (item.relations ?? []).filter((r) => r.rel === "AttachedFile");
  if (!relacoes.length) return { anexos: [], truncado: false };
  // Autor/data de cada anexo vêm da revisão em que ele foi adicionado.
  const { updates } = await lerUpdates(id);
  const todos = montarAnexos(relacoes, updates);
  return { anexos: todos.slice(0, MAX_ANEXOS), truncado: todos.length > MAX_ANEXOS };
}

export async function lerHistoricoPbi(idBruto: unknown): Promise<HistoricoPbi> {
  const id = validarId(idBruto);
  await lerItemDoEscopo(id, `fields=${CAMPOS_ESCOPO}&`);
  const { updates, truncado } = await lerUpdates(id);
  return { entradas: montarHistorico(updates), truncado };
}

export type MovimentosPbi = { movimentos: MovimentoPbi[]; truncado: boolean };
const MAX_MOVIMENTOS = 100;

/** Movimentos da plataforma (log do Fluxo do PO) de um PBI: quem moveu, de onde para onde, resultado e avisos. Lê só o banco. */
export async function lerMovimentosPbi(idBruto: unknown): Promise<MovimentosPbi> {
  const id = validarId(idBruto);
  const { data, error } = await getServiceClient()
    .from("FluxoPoMovimento")
    .select("id, criadoEm, origem, destino, direcao, proposta, usuario, usuarioNome, resultado, motivo, alteracoes, avisos, comentarioPublicado, assesments")
    .eq("workItemId", id)
    .order("criadoEm", { ascending: false })
    .limit(MAX_MOVIMENTOS + 1);
  if (error) {
    console.error("[fluxo-po/detalhe] leitura do log de movimentos falhou:", error.message);
    throw new ErroFluxoPo(502, "banco", "Não foi possível ler o log de movimentos (banco de dados).");
  }
  const linhas = (data ?? []) as LinhaMovimento[];
  return { movimentos: montarMovimentos(linhas.slice(0, MAX_MOVIMENTOS)), truncado: linhas.length > MAX_MOVIMENTOS };
}

/**
 * Publica no PBI um comentário escrito na tela (T17). Só quem pode movimentar o fluxo (403); texto não vazio e dentro do limite
 * (422); o item precisa ser PBI do KMM5. O autor no Azure é o dono do PAT, então o nome do usuário e a data vão no texto.
 */
export async function publicarComentarioUsuario(params: { id: unknown; texto: unknown; usuario: UsuarioFluxoPo; agora?: Date }): Promise<{ id: number }> {
  exigirPermissaoMovimento(params.usuario);
  const id = validarId(params.id);
  const v = validarComentario(params.texto);
  if (v.erro !== undefined) throw new ErroFluxoPo(422, "entrada_invalida", v.erro);
  await lerPbiFluxoPoAtual(id); // confere que é um PBI do KMM5 (404/422 se não)
  return publicarComentarioPbi(id, comentarioDoUsuario({ texto: v.texto, usuario: params.usuario.nome?.trim() || params.usuario.email, quando: params.agora ?? new Date() }));
}

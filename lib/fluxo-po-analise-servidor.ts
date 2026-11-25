/**
 * Fluxo do PO — "Análise" da etapa 2.1 (SERVIDOR): lê o campo Description dos Assesments FILHOS do PBI e grava de volta o texto
 * editado ("Registrar Análise"). Mesma disciplina das demais gravações: permissão no servidor, entrada validada, o Assesment
 * precisa ser filho do PBI, o PBI precisa estar na etapa 2.1, PATCH com `test /rev` do Assesment (conflito = 409) e TODA tentativa
 * vai para o log (direção "analise"). Regras puras (limpeza do HTML, perdas) em lib/fluxo-po-analise.ts.
 */
import { API_VERSION, authHeader, getConfig } from "./devops-client";
import {
  ErroFluxoPo,
  aplicarPatchPbi,
  exigirPermissaoMovimento,
  lerPbiFluxoPoAtual,
  listarAssesmentsFilhos,
  registrarMovimentoNoLog,
  type UsuarioFluxoPo,
} from "./fluxo-po-servidor";
import { derivarEtapa, traduzirErroAzure, type Alteracao, type OperacaoPatch, type PbiFluxo } from "./fluxo-po";
import { PROJETO_FLUXO_PO, TIPO_ASSESMENT } from "./fluxo-po-campos";
import { alteracaoDaAnalise, analisarPerdas, htmlSemTexto, prepararAnalise, type PerdasAnalise } from "./fluxo-po-analise";
import { sanitizarHtml } from "./html-seguro";
import { linhaDeAnalise, linhaDeFalha, type ContextoLog, type LinhaLogMovimento } from "./fluxo-po-log";

const CAMPO_DESCRICAO = "System.Description";

/** Um Assesment filho do PBI, como a tela mostra. `html` já está sanitizado; `rev` é a base da trava de edição. */
export type AssesmentAnalise = {
  id: number;
  titulo: string;
  estado: string;
  rev: number;
  html: string;
  vazia: boolean;
  truncada: boolean;
  perdas: PerdasAnalise;
};

type DetalheAssesment = { id: number; rev: number; titulo: string; estado: string; tipo: string; descricaoBruta: string };

function urlItem(org: string, id: number): string {
  return `https://dev.azure.com/${org}/${encodeURIComponent(PROJETO_FLUXO_PO)}/_apis/wit/workitems/${id}`;
}

function validarId(valor: unknown, rotulo: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErroFluxoPo(422, "entrada_invalida", `${rotulo} inválido.`);
  return n;
}

/** Lê o Assesment AGORA no Azure (revisão atual + Description). */
export async function lerAssesmentAgora(id: number): Promise<DetalheAssesment> {
  const { org, pat } = getConfig();
  const campos = ["System.WorkItemType", "System.Title", "System.State", CAMPO_DESCRICAO].map(encodeURIComponent).join(",");
  const res = await fetch(`${urlItem(org, id)}?fields=${campos}&api-version=${API_VERSION}`, { headers: authHeader(pat), cache: "no-store" });
  const corpo = await res.text();
  if (!res.ok) {
    const e = traduzirErroAzure(res.status, corpo);
    throw new ErroFluxoPo(e.status, e.codigo, e.mensagem);
  }
  const w = JSON.parse(corpo) as { id: number; rev?: number; fields: Record<string, unknown> };
  if (w.rev === undefined) throw new ErroFluxoPo(502, "sem_revisao", "O Azure DevOps não informou a revisão do Assesment; nada foi lido nem gravado.");
  return {
    id: w.id,
    rev: w.rev,
    titulo: String(w.fields["System.Title"] ?? `Assesment ${w.id}`),
    estado: String(w.fields["System.State"] ?? ""),
    tipo: String(w.fields["System.WorkItemType"] ?? ""),
    descricaoBruta: String(w.fields[CAMPO_DESCRICAO] ?? ""),
  };
}

function paraAssesmentAnalise(d: DetalheAssesment): AssesmentAnalise {
  const { html, truncado } = sanitizarHtml(d.descricaoBruta);
  return { id: d.id, titulo: d.titulo, estado: d.estado, rev: d.rev, html, vazia: htmlSemTexto(html), truncada: truncado, perdas: analisarPerdas(d.descricaoBruta) };
}

/** Dependências trocáveis só nos testes. */
export type DependenciasAnalise = {
  lerPbi: (id: number) => Promise<PbiFluxo>;
  listarFilhos: (pbiId: number) => Promise<{ id: number }[]>;
  lerAssesment: (id: number) => Promise<DetalheAssesment>;
  aplicarPatch: (id: number, operacoes: OperacaoPatch[]) => Promise<{ rev: number }>;
  registrarLog: (linha: LinhaLogMovimento) => Promise<boolean>;
};

const DEPENDENCIAS_REAIS: DependenciasAnalise = {
  lerPbi: lerPbiFluxoPoAtual,
  listarFilhos: listarAssesmentsFilhos,
  lerAssesment: lerAssesmentAgora,
  aplicarPatch: aplicarPatchPbi,
  registrarLog: registrarMovimentoNoLog,
};

/** Assesments filhos do PBI com a Description de cada um (qualquer usuário logado pode ver). */
export async function lerAnalisesDoPbi(idBruto: unknown, deps: Partial<DependenciasAnalise> = {}): Promise<{ assesments: AssesmentAnalise[] }> {
  const d = { ...DEPENDENCIAS_REAIS, ...deps };
  const id = validarId(idBruto, "ID do PBI");
  await d.lerPbi(id); // confere que é um PBI do KMM5 (404/422 se não)
  const filhos = await d.listarFilhos(id);
  const detalhes = await Promise.all(filhos.map((f) => d.lerAssesment(f.id)));
  return { assesments: detalhes.filter((x) => x.tipo.toLowerCase() === TIPO_ASSESMENT.toLowerCase()).map(paraAssesmentAnalise).sort((a, b) => a.id - b.id) };
}

export type ResultadoAnalise = { assesment: AssesmentAnalise; alteracoes: Alteracao[]; avisos: string[] };

type Params = {
  id: unknown;
  assesmentId: unknown;
  html: unknown;
  /** Revisão do Assesment que a tela mostrava ao abrir (base da trava). */
  rev: unknown;
  usuario: UsuarioFluxoPo;
  deps?: Partial<DependenciasAnalise>;
};

/**
 * Registra a análise: grava o texto no campo Description do Assesment. Ordem: permissão (403) → entrada (422) → PBI do KMM5 na etapa 2.1
 * (422) → o Assesment é filho do PBI (422) → revisão igual à da tela (409) → PATCH com `test /rev` (409 se mudou no meio) → relê.
 */
export async function registrarAnalise(params: Params): Promise<ResultadoAnalise> {
  const d = { ...DEPENDENCIAS_REAIS, ...params.deps };
  const idNumerico = Number(params.id);
  const assesmentNumerico = Number(params.assesmentId);
  const ctx: ContextoLog = {
    workItemId: Number.isInteger(idNumerico) && idNumerico > 0 ? idNumerico : null,
    origem: null,
    destino: Number.isInteger(assesmentNumerico) && assesmentNumerico > 0 ? `Análise (Assesment ${assesmentNumerico})` : "Análise",
    direcao: "analise",
    proposta: false,
    usuario: params.usuario.email,
    usuarioNome: params.usuario.nome?.trim() || null,
    revisaoAntes: null,
    alteracoes: null,
  };
  try {
    const r = await executar(params, d, ctx);
    if (ctx.workItemId !== null && !(await d.registrarLog(linhaDeAnalise({ ...ctx, workItemId: ctx.workItemId }, r)))) {
      r.avisos.push("A análise foi registrada, mas não foi possível gravá-la no log da plataforma.");
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

async function executar(params: Params, d: DependenciasAnalise, ctx: ContextoLog): Promise<ResultadoAnalise> {
  exigirPermissaoMovimento(params.usuario);
  const id = validarId(params.id, "ID do PBI");
  const assesmentId = validarId(params.assesmentId, "ID do Assesment");
  const rev = validarId(params.rev, "Revisão do Assesment");
  const texto = prepararAnalise(params.html);
  if (texto.erro !== undefined) throw new ErroFluxoPo(422, "entrada_invalida", texto.erro);

  const pbi = await d.lerPbi(id);
  ctx.origem = derivarEtapa(pbi).etapa;
  if (ctx.origem !== "2.1") throw new ErroFluxoPo(422, "regra", "A análise só pode ser registrada enquanto o card está na etapa 2.1 (Comitê / Proposta de solução); nada foi gravado.");

  const filhos = await d.listarFilhos(id);
  if (!filhos.some((f) => f.id === assesmentId)) throw new ErroFluxoPo(422, "entrada_invalida", `O Assesment ${assesmentId} não é filho deste PBI; nada foi gravado.`);

  const atual = await d.lerAssesment(assesmentId);
  ctx.revisaoAntes = atual.rev;
  if (atual.rev !== rev) {
    throw new ErroFluxoPo(409, "conflito", "O Assesment foi alterado no Azure DevOps depois que você abriu a tela. Recarregue para ver a versão atual; nada foi gravado.");
  }

  const antes = sanitizarHtml(atual.descricaoBruta).html;
  const alteracoes: Alteracao[] = [alteracaoDaAnalise(assesmentId, antes, texto.html)];
  await d.aplicarPatch(assesmentId, [
    { op: "test", path: "/rev", value: rev },
    { op: "add", path: `/fields/${CAMPO_DESCRICAO}`, value: texto.html },
  ]);

  return { assesment: paraAssesmentAnalise(await d.lerAssesment(assesmentId)), alteracoes, avisos: [] };
}

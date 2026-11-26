/**
 * Fluxo do PO — "Requisitos de segurança e privacidade de dados" da etapa 2.1 (SERVIDOR): lê o formulário já registrado na Description
 * do PBI e grava o complemento ("Registrar requisitos"). Mesma disciplina das demais gravações: permissão no servidor, entrada
 * validada, card na etapa 2.1, PATCH com `test /rev` (conflito = 409) e TODA tentativa vai para o log (direção "seguranca").
 * A Description é regravada a partir do HTML BRUTO que está no Azure AGORA (só o bloco do formulário é trocado), nunca da versão
 * sanitizada da tela. Regras puras (HTML do bloco, leitura, validação) em lib/fluxo-po-seguranca.ts.
 */
import { API_VERSION, authHeader, getConfig } from "./devops-client";
import { ErroFluxoPo, aplicarPatchPbi, exigirPermissaoMovimento, lerPbiFluxoPoAtual, registrarMovimentoNoLog, type UsuarioFluxoPo } from "./fluxo-po-servidor";
import { derivarEtapa, traduzirErroAzure, type Alteracao, type OperacaoPatch, type PbiFluxo } from "./fluxo-po";
import { PROJETO_FLUXO_PO } from "./fluxo-po-campos";
import { linhaDeFalha, linhaDeSeguranca, type ContextoLog, type LinhaLogMovimento } from "./fluxo-po-log";
import {
  alteracaoDaSeguranca,
  aplicarBlocoNaDescricao,
  formularioVazio,
  lerBaseDaTela,
  lerSegurancaDaDescricao,
  mesmoFormulario,
  montarBlocoSeguranca,
  validarRespostas,
  type ItemSeguranca,
} from "./fluxo-po-seguranca";

const CAMPO_DESCRICAO = "System.Description";
/** O Azure recusa HTML de campo acima disto (1 MB); margem para não chegar perto. */
const LIMITE_DESCRICAO = 900_000;

export type EstadoSeguranca = {
  /** Etapa em que o card está agora. */
  etapa: string | null;
  /** O formulário já foi registrado na Description? */
  registrado: boolean;
  itens: ItemSeguranca[];
};
export type ResultadoSeguranca = { estado: EstadoSeguranca; alteracoes: Alteracao[]; avisos: string[] };

type DescricaoAgora = { rev: number; descricaoBruta: string };

/** Dependências trocáveis só nos testes. */
export type DependenciasSeguranca = {
  lerPbi: (id: number) => Promise<PbiFluxo>;
  lerDescricao: (id: number) => Promise<DescricaoAgora>;
  aplicarPatch: (id: number, operacoes: OperacaoPatch[]) => Promise<{ rev: number }>;
  registrarLog: (linha: LinhaLogMovimento) => Promise<boolean>;
  agora: () => Date;
};

/** Lê a revisão e a Description BRUTA do PBI no Azure AGORA (os dois na mesma chamada, para a trava `test /rev` valer para esse texto). */
export async function lerDescricaoAgora(id: number): Promise<DescricaoAgora> {
  const { org, pat } = getConfig();
  const url = `https://dev.azure.com/${org}/${encodeURIComponent(PROJETO_FLUXO_PO)}/_apis/wit/workitems/${id}?fields=${encodeURIComponent(CAMPO_DESCRICAO)}&api-version=${API_VERSION}`;
  const res = await fetch(url, { headers: authHeader(pat), cache: "no-store" });
  const corpo = await res.text();
  if (!res.ok) {
    const e = traduzirErroAzure(res.status, corpo);
    throw new ErroFluxoPo(e.status, e.codigo, e.mensagem);
  }
  const w = JSON.parse(corpo) as { rev?: number; fields: Record<string, unknown> };
  if (w.rev === undefined) throw new ErroFluxoPo(502, "sem_revisao", "O Azure DevOps não informou a revisão do PBI; nada foi lido nem gravado.");
  return { rev: w.rev, descricaoBruta: String(w.fields[CAMPO_DESCRICAO] ?? "") };
}

const DEPENDENCIAS_REAIS: DependenciasSeguranca = {
  lerPbi: lerPbiFluxoPoAtual,
  lerDescricao: lerDescricaoAgora,
  aplicarPatch: aplicarPatchPbi,
  registrarLog: registrarMovimentoNoLog,
  agora: () => new Date(),
};

function validarId(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErroFluxoPo(422, "entrada_invalida", "ID do PBI inválido.");
  return n;
}

/** O formulário registrado no PBI (em branco se ainda não há) e a etapa do card. Qualquer usuário logado pode ver. */
export async function lerSegurancaDoPbi(idBruto: unknown, deps: Partial<DependenciasSeguranca> = {}): Promise<EstadoSeguranca> {
  const d = { ...DEPENDENCIAS_REAIS, ...deps };
  const id = validarId(idBruto);
  const pbi = await d.lerPbi(id); // confere que é um PBI do KMM5 (404/422 se não)
  const { descricaoBruta } = await d.lerDescricao(id);
  const itens = lerSegurancaDaDescricao(descricaoBruta);
  return { etapa: derivarEtapa(pbi).etapa, registrado: itens !== null, itens: itens ?? formularioVazio() };
}

type Params = {
  id: unknown;
  /** As respostas da tela: `[{ id, resposta: "sim"|"nao"|"na", observacao }]`. */
  respostas: unknown;
  /** O formulário como a tela o mostrava ao abrir (base da trava de edição simultânea); `null` = ainda não havia. */
  base: unknown;
  usuario: UsuarioFluxoPo;
  deps?: Partial<DependenciasSeguranca>;
};

/**
 * Registra os requisitos: grava o bloco do formulário no fim da Description. Ordem: permissão (403) → entrada (422) → PBI do KMM5 na
 * etapa 2.1 (422) → Description lida agora → o formulário no Azure é o mesmo que a tela mostrava (409) → PATCH com `test /rev` (409 se
 * mudou no meio) → relê.
 */
export async function registrarSeguranca(params: Params): Promise<ResultadoSeguranca> {
  const d = { ...DEPENDENCIAS_REAIS, ...params.deps };
  const idNumerico = Number(params.id);
  const ctx: ContextoLog = {
    workItemId: Number.isInteger(idNumerico) && idNumerico > 0 ? idNumerico : null,
    origem: null,
    destino: "Requisitos de segurança",
    direcao: "seguranca",
    proposta: false,
    usuario: params.usuario.email,
    usuarioNome: params.usuario.nome?.trim() || null,
    revisaoAntes: null,
    alteracoes: null,
  };
  try {
    const r = await executar(params, d, ctx);
    if (ctx.workItemId !== null && !(await d.registrarLog(linhaDeSeguranca({ ...ctx, workItemId: ctx.workItemId }, r)))) {
      r.avisos.push("Os requisitos foram registrados, mas não foi possível gravá-los no log da plataforma.");
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

async function executar(params: Params, d: DependenciasSeguranca, ctx: ContextoLog): Promise<ResultadoSeguranca> {
  exigirPermissaoMovimento(params.usuario);
  const id = validarId(params.id);
  const validado = validarRespostas(params.respostas);
  if (validado.erro !== undefined) throw new ErroFluxoPo(422, "entrada_invalida", validado.erro);

  const pbi = await d.lerPbi(id);
  ctx.origem = derivarEtapa(pbi).etapa;
  if (ctx.origem !== "2.1") {
    throw new ErroFluxoPo(422, "regra", "Os requisitos de segurança só podem ser registrados enquanto o card está na etapa 2.1 (Comitê / Proposta de solução); nada foi gravado.");
  }

  const atual = await d.lerDescricao(id);
  ctx.revisaoAntes = atual.rev;
  const noAzure = lerSegurancaDaDescricao(atual.descricaoBruta);
  // Só barra quem deixou a tela aberta enquanto OUTRA pessoa mudou o formulário; mudanças em outras partes da Description não importam.
  const baseDaTela = lerBaseDaTela(params.base);
  if (!mesmoFormulario(noAzure, baseDaTela)) {
    throw new ErroFluxoPo(409, "conflito", "O formulário de requisitos de segurança foi alterado por outra pessoa depois que você abriu a tela. Recarregue para ver a versão atual; nada foi gravado.");
  }

  const nova = aplicarBlocoNaDescricao(atual.descricaoBruta, montarBlocoSeguranca(validado.itens, { quem: params.usuario.nome?.trim() || params.usuario.email, quando: d.agora() }));
  if (nova.length > LIMITE_DESCRICAO) throw new ErroFluxoPo(422, "entrada_invalida", "A descrição do PBI ficaria grande demais para o Azure DevOps; nada foi gravado.");
  await d.aplicarPatch(id, [
    { op: "test", path: "/rev", value: atual.rev },
    { op: "add", path: `/fields/${CAMPO_DESCRICAO}`, value: nova },
  ]);

  const depois = await d.lerDescricao(id);
  const itens = lerSegurancaDaDescricao(depois.descricaoBruta);
  return {
    estado: { etapa: ctx.origem, registrado: itens !== null, itens: itens ?? formularioVazio() },
    alteracoes: [alteracaoDaSeguranca(noAzure, validado.itens)],
    avisos: [],
  };
}

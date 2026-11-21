import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { permissaoDoFluxo } from "@/lib/fluxo-po";
import { editarInformacoesPbi, ErroFluxoPo, lerInformacoesPbi } from "@/lib/fluxo-po-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function resposta(err: unknown, rotulo: string) {
  if (err instanceof ErroFluxoPo) return NextResponse.json({ erro: err.message, codigo: err.codigo, faltas: err.faltas }, { status: err.status });
  console.error(`[fluxo-po/informacoes ${rotulo}] falha inesperada:`, err);
  return NextResponse.json({ erro: "Não foi possível processar as informações do PBI." }, { status: 500 });
}

/**
 * Informações do PBI para a tela de detalhe: o PBI, o card (etapa, prontidão), as listas de valores do Azure (Cliente,
 * Classificação, esteiras) e a permissão de quem está vendo. Qualquer usuário logado lê.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  try {
    const permissao = permissaoDoFluxo(usuario.papel, usuario.tipo);
    return NextResponse.json({ ...(await lerInformacoesPbi(params.id)), permissao, podeMovimentar: permissao.pode, eu: { email: usuario.email, nome: usuario.nome } });
  } catch (err) {
    return resposta(err, "GET");
  }
}

/**
 * Edita as informações do PBI. Corpo `{ entrada, base? }`: `entrada` = só os campos que mudam (cliente, classificacao, areaPath,
 * dataAberturaProduto, dataComite; texto vazio limpa o campo); `base` = os valores que a tela mostrava desses campos ao abrir —
 * se algum já mudou no Azure, 409 com a lista (nada é gravado). (Corpo antigo, só com os campos, ainda é aceito, sem checagem de base.)
 * Só quem pode movimentar o fluxo; tudo é revalidado no servidor.
 * 200 { alteracoes, pbi, card, assesments, avisos, semMudancas } · 403 · 404 · 409 · 422 (com `faltas`) · 502.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  let corpo: { entrada?: unknown; base?: unknown } & Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }
  try {
    const novoFormato = corpo !== null && typeof corpo === "object" && "entrada" in corpo;
    return NextResponse.json(await editarInformacoesPbi({ id: params.id, entrada: novoFormato ? corpo.entrada : corpo, base: novoFormato ? corpo.base : undefined, usuario }));
  } catch (err) {
    return resposta(err, "PATCH");
  }
}

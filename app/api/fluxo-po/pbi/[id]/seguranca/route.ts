import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { ErroFluxoPo } from "@/lib/fluxo-po-servidor";
import { lerSegurancaDoPbi, registrarSeguranca } from "@/lib/fluxo-po-seguranca-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function resposta(err: unknown, rotulo: string) {
  if (err instanceof ErroFluxoPo) return NextResponse.json({ erro: err.message, codigo: err.codigo, faltas: err.faltas }, { status: err.status });
  console.error(`[fluxo-po/seguranca ${rotulo}] falha inesperada:`, err);
  return NextResponse.json({ erro: "Não foi possível processar os requisitos de segurança do PBI." }, { status: 500 });
}

/**
 * Requisitos de segurança e privacidade (etapa 2.1): o formulário já registrado na Description do PBI (em branco se ainda não há) e a
 * etapa do card. Qualquer usuário logado lê. 200 { etapa, registrado, itens } · 404 · 422 · 502.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json(await lerSegurancaDoPbi(params.id));
  } catch (err) {
    return resposta(err, "GET");
  }
}

/**
 * "Registrar requisitos": grava o formulário como complemento no fim da Description do PBI. Corpo `{ respostas, base }` (`base` = o
 * formulário como a tela o mostrava ao abrir, ou null; se outra pessoa o mudou no Azure, 409 e nada é gravado). Só quem pode movimentar
 * o fluxo, com o card na etapa 2.1. 200 { estado, alteracoes, avisos } · 403 · 409 · 422 · 502.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  let corpo: { respostas?: unknown; base?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await registrarSeguranca({ id: params.id, respostas: corpo?.respostas, base: corpo?.base, usuario }));
  } catch (err) {
    return resposta(err, "PUT");
  }
}

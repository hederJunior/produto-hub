import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { ErroFluxoPo } from "@/lib/fluxo-po-servidor";
import { lerComentariosPbi, publicarComentarioUsuario } from "@/lib/fluxo-po-detalhe-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function resposta(err: unknown, rotulo: string) {
  if (err instanceof ErroFluxoPo) return NextResponse.json({ erro: err.message, codigo: err.codigo }, { status: err.status });
  console.error(`[fluxo-po/comentarios ${rotulo}] falha inesperada:`, err);
  return NextResponse.json({ erro: "Não foi possível processar os comentários do PBI." }, { status: 500 });
}

/** Comentários do PBI (HTML sanitizado, mais recentes primeiro). Qualquer usuário logado lê. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json(await lerComentariosPbi(params.id));
  } catch (err) {
    return resposta(err, "GET");
  }
}

/**
 * Publica um comentário no PBI: corpo `{ texto }`. Só quem pode movimentar o fluxo (403 com o motivo). O autor no Azure é o dono do PAT;
 * o nome do usuário e a data vão no texto ("via Produto Hub"). 200 `{ id }` · 403 · 404 · 422 · 502.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  let corpo: { texto?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await publicarComentarioUsuario({ id: params.id, texto: corpo.texto, usuario }));
  } catch (err) {
    return resposta(err, "POST");
  }
}

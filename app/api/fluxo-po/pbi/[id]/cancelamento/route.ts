import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { ErroFluxoPo } from "@/lib/fluxo-po-servidor";
import { cancelarDemandaPbi } from "@/lib/fluxo-po-cancelamento-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cancela a demanda (PBI na etapa 1.1): publica o comentário e muda o Status para "Cancelado". Corpo `{ motivo, texto }` — `motivo` é um dos
 * cinco motivos fixos (lib/fluxo-po.ts) e `texto` é o texto padrão do motivo, editado ou não pelo usuário. Só quem pode movimentar o
 * fluxo (403 com o motivo); revalidado aqui no servidor. 200 `{ alteracoes, comentario, avisos, pbi }` · 403 · 404 · 409 · 422 · 502.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  let corpo: { motivo?: unknown; texto?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await cancelarDemandaPbi({ id: params.id, motivo: corpo.motivo, texto: corpo.texto, usuario }));
  } catch (err) {
    if (err instanceof ErroFluxoPo) return NextResponse.json({ erro: err.message, codigo: err.codigo, faltas: err.faltas }, { status: err.status });
    console.error("[fluxo-po/cancelamento] falha inesperada:", err);
    return NextResponse.json({ erro: "Não foi possível cancelar a demanda. Nada foi confirmado; atualize a tela." }, { status: 500 });
  }
}

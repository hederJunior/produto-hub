import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { ErroFluxoPo } from "@/lib/fluxo-po-servidor";
import { lerAnalisesDoPbi, registrarAnalise } from "@/lib/fluxo-po-analise-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function resposta(err: unknown, rotulo: string) {
  if (err instanceof ErroFluxoPo) return NextResponse.json({ erro: err.message, codigo: err.codigo, faltas: err.faltas }, { status: err.status });
  console.error(`[fluxo-po/analise ${rotulo}] falha inesperada:`, err);
  return NextResponse.json({ erro: "Não foi possível processar a análise do PBI." }, { status: 500 });
}

/**
 * Análise da etapa 2.1: os Assesments FILHOS do PBI com o campo Description de cada um (HTML já sanitizado), a revisão de cada um
 * (base da trava de edição) e o que se perderia ao regravar o texto (imagens, estilos). Qualquer usuário logado lê.
 * 200 { assesments: [...] } · 404 · 422 · 502.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json(await lerAnalisesDoPbi(params.id));
  } catch (err) {
    return resposta(err, "GET");
  }
}

/**
 * "Registrar Análise": grava o texto no campo Description do Assesment. Corpo `{ assesmentId, html, rev }` (`rev` = revisão do Assesment
 * que a tela mostrava; se mudou no Azure, 409 e nada é gravado). Só quem pode movimentar o fluxo, com o card na etapa 2.1; o HTML é
 * limpo no servidor. 200 { assesment, alteracoes, avisos } · 403 · 409 · 422 · 502.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  let corpo: { assesmentId?: unknown; html?: unknown; rev?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await registrarAnalise({ id: params.id, assesmentId: corpo?.assesmentId, html: corpo?.html, rev: corpo?.rev, usuario }));
  } catch (err) {
    return resposta(err, "PUT");
  }
}

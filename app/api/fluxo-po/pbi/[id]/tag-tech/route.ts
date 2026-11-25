import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { ErroFluxoPo } from "@/lib/fluxo-po-servidor";
import { lerTagTech, marcarNecessarioAnaliseTech } from "@/lib/fluxo-po-tag-tech-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function resposta(err: unknown, rotulo: string) {
  if (err instanceof ErroFluxoPo) return NextResponse.json({ erro: err.message, codigo: err.codigo, faltas: err.faltas }, { status: err.status });
  console.error(`[fluxo-po/tag-tech ${rotulo}] falha inesperada:`, err);
  return NextResponse.json({ erro: "Não foi possível processar a tag do PBI." }, { status: 500 });
}

/** O PBI já tem a tag "Pronto para refinamento tech"? Qualquer usuário logado lê. 200 { aplicada } · 404 · 422 · 502. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json(await lerTagTech(params.id));
  } catch (err) {
    return resposta(err, "GET");
  }
}

/**
 * Botão "Necessário análise tech": acrescenta a tag "Pronto para refinamento tech" ao PBI (mantém as outras; se já tem, não grava). Só quem pode
 * movimentar o fluxo, com o card na etapa 2.1. 200 { aplicada, jaTinha, tags, alteracoes, avisos } · 403 · 409 · 422 · 502.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json(await marcarNecessarioAnaliseTech({ id: params.id, usuario }));
  } catch (err) {
    return resposta(err, "POST");
  }
}

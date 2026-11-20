import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { ErroFluxoPo } from "@/lib/fluxo-po-servidor";
import { lerAnexosPbi, lerComentariosPbi, lerDescricaoPbi, lerHistoricoPbi } from "@/lib/fluxo-po-detalhe-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LEITORES = {
  descricao: lerDescricaoPbi,
  comentarios: lerComentariosPbi,
  anexos: lerAnexosPbi,
  historico: lerHistoricoPbi,
} as const;

/**
 * Detalhe de um PBI do Fluxo do PO — SÓ LEITURA, qualquer usuário logado:
 * GET /api/fluxo-po/pbi/{id}/descricao | comentarios | anexos | historico
 * Descrição e comentários voltam com HTML já sanitizado. Cada parte é uma chamada (falhas são independentes na tela).
 */
export async function GET(_req: Request, { params }: { params: { id: string; parte: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const leitor = LEITORES[params.parte as keyof typeof LEITORES];
  if (!leitor) return NextResponse.json({ erro: "Parte inexistente. Use descricao, comentarios, anexos ou historico." }, { status: 404 });

  try {
    return NextResponse.json(await leitor(params.id));
  } catch (err) {
    if (err instanceof ErroFluxoPo) return NextResponse.json({ erro: err.message, codigo: err.codigo }, { status: err.status });
    console.error(`[fluxo-po/pbi/${params.parte}] falha inesperada:`, err);
    return NextResponse.json({ erro: "Não foi possível carregar os dados do PBI." }, { status: 500 });
  }
}

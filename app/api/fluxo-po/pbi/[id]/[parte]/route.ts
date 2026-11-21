import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { ErroFluxoPo } from "@/lib/fluxo-po-servidor";
import { lerAnexosPbi, lerDescricaoPbi, lerHistoricoPbi, lerMovimentosPbi, lerRevisaoPbi } from "@/lib/fluxo-po-detalhe-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LEITORES = {
  descricao: lerDescricaoPbi,
  anexos: lerAnexosPbi,
  historico: lerHistoricoPbi,
  movimentos: lerMovimentosPbi,
  revisao: lerRevisaoPbi,
} as const;

/**
 * Detalhe de um PBI do Fluxo do PO — SÓ LEITURA, qualquer usuário logado:
 * GET /api/fluxo-po/pbi/{id}/descricao | anexos | historico (revisões no Azure) | movimentos (log da plataforma)
 * GET .../revisao: revisão atual do PBI no Azure (leitura leve; a tela a consulta para avisar que o PBI mudou)
 * (os comentários têm rota própria, com GET e POST: .../comentarios)
 * Descrição e comentários voltam com HTML já sanitizado. Cada parte é uma chamada (falhas são independentes na tela).
 */
export async function GET(_req: Request, { params }: { params: { id: string; parte: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const leitor = LEITORES[params.parte as keyof typeof LEITORES];
  if (!leitor) return NextResponse.json({ erro: "Parte inexistente. Use descricao, anexos, historico, movimentos ou revisao." }, { status: 404 });

  try {
    return NextResponse.json(await leitor(params.id));
  } catch (err) {
    if (err instanceof ErroFluxoPo) return NextResponse.json({ erro: err.message, codigo: err.codigo }, { status: err.status });
    console.error(`[fluxo-po/pbi/${params.parte}] falha inesperada:`, err);
    return NextResponse.json({ erro: "Não foi possível carregar os dados do PBI." }, { status: 500 });
  }
}

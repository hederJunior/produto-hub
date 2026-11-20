import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { ErroFluxoPo, moverPbiFluxoPo } from "@/lib/fluxo-po-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Move um PBI de etapa no Fluxo do PO. Corpo: `{ id, destino, entrada? }` (entrada = Area Path, Classificação, Cliente,
 * Data Abertura Produto, Data Comitê informados na tela). Toda a validação (permissão, regras, revisão) é refeita AQUI
 * com o PBI lido agora do Azure — a tela não é confiável.
 * Respostas: 200 { ...resultado }; 401 sem sessão; 403 sem permissão; 404 PBI inexistente; 409 PBI mudou desde a leitura;
 * 422 regra/entrada inválida (com `faltas`, nada gravado); 502 falha do Azure.
 */
export async function POST(req: Request) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  let corpo: { id?: unknown; destino?: unknown; entrada?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  try {
    const resultado = await moverPbiFluxoPo({ id: corpo.id, destino: corpo.destino, entrada: corpo.entrada, usuario });
    return NextResponse.json(resultado);
  } catch (err) {
    if (err instanceof ErroFluxoPo) {
      return NextResponse.json({ erro: err.message, codigo: err.codigo, faltas: err.faltas }, { status: err.status });
    }
    console.error("[fluxo-po/mover] falha inesperada:", err);
    return NextResponse.json({ erro: "Erro inesperado ao mover o PBI. Nada foi confirmado; atualize o quadro." }, { status: 500 });
  }
}

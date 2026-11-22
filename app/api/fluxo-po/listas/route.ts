import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { lerListasDeValores } from "@/lib/fluxo-po-listas-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Listas de valores do Azure DevOps usadas pelos editores do Fluxo do PO: Classificação, Cliente e esteiras (leitura, cache de
 * 5 minutos no servidor). Qualquer usuário logado. A confirmação de mover usa estas listas para pedir o que falta no card.
 */
export async function GET() {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json(await lerListasDeValores());
  } catch (err) {
    console.error("[fluxo-po/listas] falha:", err);
    return NextResponse.json({ erro: "Não foi possível ler as listas do Azure DevOps." }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getPbisGestaoClientes } from "@/lib/devops-client";
import type { Produto } from "@/lib/devops-projetos";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Tela "Gestão de clientes": PBIs nos status do board configurados em lib/gestao-clientes.ts.
 * "AMBOS" consulta KMM4 e KMM5; um produto específico consulta só aquele TeamProject.
 * Os comentários vêm à parte (./comentarios), em lotes, pra tela aparecer logo.
 */
export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const produtos: Produto[] = param === "KMM4" || param === "KMM5" ? [param] : ["KMM4", "KMM5"];

  try {
    const { itens, avisos } = await getPbisGestaoClientes(produtos);
    return NextResponse.json({ itens, avisos });
  } catch (err) {
    console.error("[clientes/pbis] falha ao buscar PBIs do Azure DevOps:", err);
    return NextResponse.json({ erro: "Não foi possível carregar os PBIs do Azure DevOps.", itens: [], avisos: [] }, { status: 502 });
  }
}

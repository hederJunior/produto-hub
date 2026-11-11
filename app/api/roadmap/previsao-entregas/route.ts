import { NextRequest, NextResponse } from "next/server";
import { getPrevisaoEntregas } from "@/lib/devops-client";
import { DEVOPS_PROJETOS } from "@/lib/devops-projetos";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Alimenta a aba Downstream > "Previsão de Entregas" (pedido por Heder em 2026-11-11): PBIs em aberto
 * agrupados pela Iteration (sprint) — ver getPrevisaoEntregas. "AMBOS" consulta KMM4 e KMM5.
 */
export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const projetos =
    produtoParam === "AMBOS"
      ? Object.values(DEVOPS_PROJETOS).map((p) => p.project)
      : [DEVOPS_PROJETOS[produtoParam as keyof typeof DEVOPS_PROJETOS]?.project ?? produtoParam];

  try {
    const dados = await getPrevisaoEntregas(projetos);
    return NextResponse.json(dados, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[roadmap/previsao-entregas] falha ao buscar a Previsão de Entregas do Azure DevOps:", err);
    const detalhe = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ erro: "Não foi possível carregar a Previsão de Entregas do Azure DevOps.", detalhe, itens: [], sprints: [], avisos: [] }, { status: 502 });
  }
}

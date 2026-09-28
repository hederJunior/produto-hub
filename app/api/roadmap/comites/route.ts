import { NextRequest, NextResponse } from "next/server";
import { getDemandasComite } from "@/lib/devops-client";
import { DEVOPS_PROJETOS } from "@/lib/devops-projetos";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";

/**
 * Alimenta a aba "Comitês" do painel "Roadmap e Entregas" (pedido por Heder em 2026-09-28, a
 * partir de um dashboard Power BI existente "Demandas Programadas") — lista de PBIs com Data de
 * Comitê marcada (ver getDemandasComite em lib/devops-client.ts).
 *
 * Mesmo padrão de produto do header já usado em /api/roadmap/epicos: "AMBOS" consulta os dois
 * TeamProjects (KMM4 e KMM5), um produto específico restringe a esse TeamProject só.
 */
export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const projetos =
    produtoParam === "AMBOS"
      ? Object.values(DEVOPS_PROJETOS).map((p) => p.project)
      : [DEVOPS_PROJETOS[produtoParam as keyof typeof DEVOPS_PROJETOS]?.project ?? produtoParam];

  try {
    const demandas = await getDemandasComite(projetos);
    return NextResponse.json({ demandas });
  } catch (err) {
    console.error("[roadmap/comites] falha ao buscar demandas de comitê do Azure DevOps:", err);
    return NextResponse.json(
      { erro: "Não foi possível carregar as demandas de comitê do Azure DevOps.", demandas: [] },
      { status: 502 }
    );
  }
}

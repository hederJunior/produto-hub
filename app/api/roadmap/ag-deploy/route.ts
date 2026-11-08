import { NextRequest, NextResponse } from "next/server";
import { getAgDeploy } from "@/lib/devops-client";
import { DEVOPS_PROJETOS } from "@/lib/devops-projetos";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Alimenta a aba Downstream > "Ag. Deploy" do painel "Roadmap e entregas" (pedido por Heder em
 * 2026-11-08): PBIs em State = Aguardando Deploy (ver getAgDeploy). Mesmo padrão de produto das
 * outras abas: "AMBOS" consulta KMM4 e KMM5.
 */
export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const projetos =
    produtoParam === "AMBOS"
      ? Object.values(DEVOPS_PROJETOS).map((p) => p.project)
      : [DEVOPS_PROJETOS[produtoParam as keyof typeof DEVOPS_PROJETOS]?.project ?? produtoParam];

  try {
    const itens = await getAgDeploy(projetos);
    return NextResponse.json({ itens }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[roadmap/ag-deploy] falha ao buscar Ag. Deploy do Azure DevOps:", err);
    const detalhe = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ erro: "Não foi possível carregar Ag. Deploy do Azure DevOps.", detalhe, itens: [] }, { status: 502 });
  }
}

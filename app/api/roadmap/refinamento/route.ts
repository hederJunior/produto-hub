import { NextRequest, NextResponse } from "next/server";
import { getRefinamentoTech } from "@/lib/devops-client";
import { DEVOPS_PROJETOS } from "@/lib/devops-projetos";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Alimenta a seção Backlog > "Refinamento Tech" do painel "Roadmap e entregas" (pedido por Heder em
 * 2026-11-02): PBIs em State = Backlog, Etapa = Análise e tag "Pronto para refinamento tech" (ver
 * getRefinamentoTech). Mesmo padrão de produto das outras abas: "AMBOS" consulta KMM4 e KMM5.
 */
export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const projetos =
    produtoParam === "AMBOS"
      ? Object.values(DEVOPS_PROJETOS).map((p) => p.project)
      : [DEVOPS_PROJETOS[produtoParam as keyof typeof DEVOPS_PROJETOS]?.project ?? produtoParam];

  try {
    const itens = await getRefinamentoTech(projetos);
    return NextResponse.json({ itens }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[roadmap/refinamento] falha ao buscar o Refinamento Tech do Azure DevOps:", err);
    const detalhe = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ erro: "Não foi possível carregar o Refinamento Tech do Azure DevOps.", detalhe, itens: [] }, { status: 502 });
  }
}

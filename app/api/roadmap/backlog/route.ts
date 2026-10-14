import { NextRequest, NextResponse } from "next/server";
import { getBacklogEsteirasClientes } from "@/lib/devops-client";
import { DEVOPS_PROJETOS } from "@/lib/devops-projetos";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Alimenta a seção Backlog > "Esteiras Clientes" do painel "Roadmap e entregas" (pedido por Heder
 * em 2026-10-14): PBIs em State = Backlog e Etapa = Backlog das squads de Esteiras Clientes (ver
 * getBacklogEsteirasClientes). Mesmo padrão de produto do header das outras abas: "AMBOS" consulta
 * KMM4 e KMM5; as squads só existem no KMM5, então KMM4 sozinho volta vazio.
 */
export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const projetos =
    produtoParam === "AMBOS"
      ? Object.values(DEVOPS_PROJETOS).map((p) => p.project)
      : [DEVOPS_PROJETOS[produtoParam as keyof typeof DEVOPS_PROJETOS]?.project ?? produtoParam];

  try {
    const itens = await getBacklogEsteirasClientes(projetos);
    return NextResponse.json({ itens }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[roadmap/backlog] falha ao buscar o backlog do Azure DevOps:", err);
    const detalhe = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ erro: "Não foi possível carregar o backlog do Azure DevOps.", detalhe, itens: [] }, { status: 502 });
  }
}

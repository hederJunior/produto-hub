import { NextRequest, NextResponse } from "next/server";
import { getKanbanDownstream } from "@/lib/devops-client";
import type { Produto } from "@/lib/devops-projetos";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Kanban do Downstream: PBIs em Execução / Aguardando Deploy já classificados por quadro e divisão.
 * "AMBOS" (padrão) consulta KMM4 e KMM5; um produto específico consulta só aquele TeamProject.
 */
export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const produtos: Produto[] = param === "KMM4" || param === "KMM5" ? [param] : ["KMM4", "KMM5"];
  try {
    return NextResponse.json(await getKanbanDownstream(produtos));
  } catch (err) {
    console.error("[roadmap/kanban-downstream] falha:", err);
    return NextResponse.json({ erro: "Não foi possível carregar o Kanban do Azure DevOps.", itens: [], avisos: [] }, { status: 502 });
  }
}

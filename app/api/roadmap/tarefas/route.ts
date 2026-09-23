import { NextRequest, NextResponse } from "next/server";
import { getTasksAlocadas } from "@/lib/devops-client";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";

/**
 * Rota nova, separada de /api/roadmap e /api/roadmap/epicos, pra alimentar a seção "Sprints
 * alocadas" do painel "Roadmap e Entregas" (pedido por Heder em 2026-09-23).
 *
 * V1 (2026-09-23): lista de IDs de Task ainda é hardcoded (só a #31537, "Ajuste cadastro de
 * pessoas"), pra validar o layout antes de generalizar. Próximo passo: trocar por uma WIQL pela
 * sprint (iteration) atual + squad, em vez de uma lista fixa.
 */
const TASK_IDS_V1 = [31537];

export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";

  try {
    const tarefas = await getTasksAlocadas(TASK_IDS_V1);
    const filtradas =
      produtoParam === "AMBOS" ? tarefas : tarefas.filter((t) => t.produto.toUpperCase() === produtoParam);

    return NextResponse.json({ tarefas: filtradas });
  } catch (err) {
    console.error("[roadmap/tarefas] falha ao buscar tasks do Azure DevOps:", err);
    return NextResponse.json(
      { erro: "Não foi possível carregar as sprints do Azure DevOps.", tarefas: [] },
      { status: 502 }
    );
  }
}

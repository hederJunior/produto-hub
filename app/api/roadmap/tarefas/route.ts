import { NextResponse } from "next/server";
import { getTasksAlocadas } from "@/lib/devops-client";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";

/**
 * Rota nova, separada de /api/roadmap e /api/roadmap/epicos, pra alimentar a seção "Sprints
 * KMM5" do painel "Roadmap e Entregas" (pedido por Heder em 2026-09-23).
 *
 * Generalizada em 2026-09-23 (mesmo dia): a v1 trazia só a Task #31537 (lista fixa), pra validar
 * o layout. Depois de aprovado, Heder pediu pra trazer TODOS os Task e Bug do projeto KMM5, a
 * partir da sprint 8.16 em diante — essa visão não depende mais do seletor de produto do header
 * (fixa em KMM5), por isso não lê `?produto=` como as outras rotas de roadmap.
 */
const PROJETO = "KMM5";
const SPRINT_MINIMA = { major: 8, minor: 16 };

export async function GET() {
  try {
    const tarefas = await getTasksAlocadas(PROJETO, SPRINT_MINIMA);
    return NextResponse.json({ tarefas });
  } catch (err) {
    console.error("[roadmap/tarefas] falha ao buscar tasks/bugs do Azure DevOps:", err);
    return NextResponse.json(
      { erro: "Não foi possível carregar as sprints do Azure DevOps.", tarefas: [] },
      { status: 502 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getTasksAlocadas } from "@/lib/devops-client";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";

/**
 * Rota nova, separada de /api/roadmap e /api/roadmap/epicos, pra alimentar a seção "Sprints"
 * do painel "Roadmap e Entregas" (pedido por Heder em 2026-09-23).
 *
 * Generalizada em 2026-09-23: a v1 trazia só a Task #31537 (lista fixa); depois passou a trazer
 * TODOS os Task/Bug do projeto KMM5 via WIQL, mas fixo em KMM5 (ignorando o seletor de produto).
 *
 * Ajustada em 2026-09-28 (pedido do Heder): o filtro de produto do header agora reflete aqui
 * também — "AMBOS" busca KMM4 e KMM5 em paralelo e junta o resultado.
 *
 * ATENÇÃO: `SPRINT_MINIMA` (8.16) foi calibrada em cima da numeração de sprint do KMM5
 * ("Sprint 8.16"). Não confirmamos se o KMM4 usa o mesmo padrão "N.M" — se não usar,
 * `getTasksAlocadas` simplesmente não vai casar nenhum item do KMM4 (nenhum item incorreto
 * aparece, só fica vazio) e isso vai precisar de ajuste depois que o Heder validar com dados
 * reais do KMM4.
 */
const SPRINT_MINIMA = { major: 8, minor: 16 };

export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const projetos = produtoParam === "AMBOS" ? ["KMM4", "KMM5"] : [produtoParam];

  try {
    const tarefas = (await Promise.all(projetos.map((p) => getTasksAlocadas(p, SPRINT_MINIMA)))).flat();
    return NextResponse.json({ tarefas });
  } catch (err) {
    console.error("[roadmap/tarefas] falha ao buscar tasks/bugs do Azure DevOps:", err);
    return NextResponse.json(
      { erro: "Não foi possível carregar as sprints do Azure DevOps.", tarefas: [] },
      { status: 502 }
    );
  }
}

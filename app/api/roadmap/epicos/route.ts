import { NextRequest, NextResponse } from "next/server";
import { getEpicComFeatures, getEpicIds, type EpicRoadmap } from "@/lib/devops-client";
import { DEVOPS_PROJETOS } from "@/lib/devops-projetos";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";

/**
 * Rota NOVA e SEPARADA de /api/roadmap (que continua com seu shape {trimestres} antigo, do qual
 * /api/avisos depende — não pode ser repropósito). Alimenta o painel "Roadmap e Entregas" novo,
 * em formato Gantt por Epic/Feature (pedido por Heder em 2026-09-22).
 *
 * Generalizada em 2026-09-28 (pedido do Heder): a v1 trazia só o Epic #15057 fixo, pra validar o
 * layout. Depois passou a trazer todos os Epics via `Custom.Produto`. Ainda em 2026-09-28, Heder
 * pediu pra trocar a regra: agora não olha mais `Custom.Produto` — só entra na visão quem tem o
 * campo "Item de Road Map Estratégico" marcado como "Sim" (ver getEpicIds em lib/devops-client.ts).
 *
 * O seletor de produto do header continua tendo efeito aqui, mas agora restringindo QUAIS
 * TeamProjects são consultados (KMM4, KMM5 ou os dois em "AMBOS"), já que a regra de negócio
 * (Custom.Produto) saiu da jogada.
 */
export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const projetos =
    produtoParam === "AMBOS"
      ? Object.values(DEVOPS_PROJETOS).map((p) => p.project)
      : [DEVOPS_PROJETOS[produtoParam as keyof typeof DEVOPS_PROJETOS]?.project ?? produtoParam];

  try {
    const ids = await getEpicIds(projetos);
    const epicos = (await Promise.all(ids.map((id) => getEpicComFeatures(id)))).filter(
      (e): e is EpicRoadmap => e !== null
    );

    return NextResponse.json({ epicos });
  } catch (err) {
    console.error("[roadmap/epicos] falha ao buscar epicos do Azure DevOps:", err);
    return NextResponse.json(
      { erro: "Não foi possível carregar o roadmap do Azure DevOps.", epicos: [] },
      { status: 502 }
    );
  }
}

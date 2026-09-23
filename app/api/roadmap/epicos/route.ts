import { NextRequest, NextResponse } from "next/server";
import { getEpicComFeatures, type EpicRoadmap } from "@/lib/devops-client";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";

/**
 * Rota NOVA e SEPARADA de /api/roadmap (que continua com seu shape {trimestres} antigo, do qual
 * /api/avisos depende — não pode ser repropósito). Alimenta o painel "Roadmap e Entregas" novo,
 * em formato Gantt por Epic/Feature (pedido por Heder em 2026-09-22).
 *
 * V1 (2026-09-22): lista de IDs de Epic ainda é hardcoded (só o #15057, "Integração SuperApp
 * <=> KMM4 (Onda 3)"), pra validar o layout com o Heder antes de generalizar. Quando aprovado, o
 * próximo passo é trocar essa lista fixa por uma WIQL `[System.WorkItemType] = 'Epic' AND
 * [Custom.Produto] = '<produto>'` (ver getEpicComFeatures em lib/devops-client.ts).
 */
const EPIC_IDS_V1 = [15057];

export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";

  try {
    const epicos = (
      await Promise.all(EPIC_IDS_V1.map((id) => getEpicComFeatures(id)))
    ).filter((e): e is EpicRoadmap => e !== null);

    const filtrados =
      produtoParam === "AMBOS" ? epicos : epicos.filter((e) => e.produto.toUpperCase() === produtoParam);

    return NextResponse.json({ epicos: filtrados });
  } catch (err) {
    console.error("[roadmap/epicos] falha ao buscar epicos do Azure DevOps:", err);
    return NextResponse.json(
      { erro: "Não foi possível carregar o roadmap do Azure DevOps.", epicos: [] },
      { status: 502 }
    );
  }
}

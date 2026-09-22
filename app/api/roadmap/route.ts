import { NextRequest, NextResponse } from "next/server";
import { getRoadmapItems } from "@/lib/devops-client";
import { DEVOPS_PROJETOS, type Produto } from "@/lib/devops-projetos";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase();
  const produtos = (
    produtoParam && produtoParam !== "AMBOS" ? [produtoParam] : Object.keys(DEVOPS_PROJETOS)
  ) as Produto[];

  const todos = (
    await Promise.all(
      produtos
        .filter((p) => DEVOPS_PROJETOS[p])
        .map((p) => {
          const { project, areaPaths } = DEVOPS_PROJETOS[p];
          return getRoadmapItems(project, areaPaths, p);
        })
    )
  ).flat();

  const trimestres: Record<string, typeof todos> = {};
  for (const item of todos) {
    trimestres[item.trimestre] ??= [];
    trimestres[item.trimestre].push(item);
  }

  return NextResponse.json({ trimestres });
}

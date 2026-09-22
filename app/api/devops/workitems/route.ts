import { NextRequest, NextResponse } from "next/server";
import { queryWorkItems } from "@/lib/devops-client";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

/**
 * Endpoint de baixo nível para consultas WIQL ad-hoc.
 * Uso interno/depuração — as telas do app devem preferir /api/indicadores,
 * que já vem com agregações prontas.
 */
export async function POST(request: NextRequest) {
  const { wiql, project } = await request.json();
  if (!wiql || typeof wiql !== "string") {
    return NextResponse.json({ erro: "Envie { wiql: string, project: string } no corpo da requisição." }, { status: 400 });
  }
  if (!project || typeof project !== "string") {
    return NextResponse.json(
      { erro: "Envie também { project: string } — ex.: \"KMM4\" ou \"KMM5\" (são projetos separados no Azure DevOps)." },
      { status: 400 }
    );
  }

  try {
    const items = await queryWorkItems(wiql, project);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 502 });
  }
}

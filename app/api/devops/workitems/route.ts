import { NextRequest, NextResponse } from "next/server";
import { queryWorkItems } from "@/lib/devops-client";

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

import { NextResponse } from "next/server";
import { getKanbanUpstream } from "@/lib/devops-client";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// As áreas do Kanban (Dedicada Maroni/Transben, Projetos de Implantação, Serviços da Carteira e SWAT) ficam no KMM5.
const PROJETO = "KMM5";

/** Kanban do Upstream da carteira: PBIs já classificados por coluna + áreas disponíveis para o filtro. */
export async function GET() {
  try {
    return NextResponse.json(await getKanbanUpstream(PROJETO));
  } catch (err) {
    console.error("[roadmap/kanban-upstream] falha:", err);
    return NextResponse.json({ erro: "Não foi possível carregar o Kanban do Azure DevOps.", itens: [], areas: [], avisos: [] }, { status: 502 });
  }
}

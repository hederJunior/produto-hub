import { NextRequest, NextResponse } from "next/server";
import { getUltimosComentarios } from "@/lib/devops-client";
import { DEVOPS_PROJETOS } from "@/lib/devops-projetos";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_POR_LOTE = 60;
const PROJETOS_VALIDOS = new Set(Object.values(DEVOPS_PROJETOS).map((p) => p.project));

/**
 * POST { itens: [{ id, projeto }] } → { comentarios: { [id]: { texto, autor, data } | null } }.
 * Valida id (inteiro) e projeto (só KMM4/KMM5) antes de montar a URL do Azure.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const brutos: unknown[] = Array.isArray(body?.itens) ? body.itens : [];
  const itens = brutos
    .map((i) => i as { id?: unknown; projeto?: unknown })
    .filter((i) => Number.isInteger(i.id) && typeof i.projeto === "string" && PROJETOS_VALIDOS.has(i.projeto))
    .slice(0, MAX_POR_LOTE) as { id: number; projeto: string }[];

  if (!itens.length) return NextResponse.json({ comentarios: {} });
  try {
    return NextResponse.json({ comentarios: await getUltimosComentarios(itens) });
  } catch (err) {
    console.error("[clientes/pbis/comentarios] falha:", err);
    return NextResponse.json({ erro: "Falha ao buscar comentários.", comentarios: {} }, { status: 502 });
  }
}

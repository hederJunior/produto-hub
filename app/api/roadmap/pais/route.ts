import { NextRequest, NextResponse } from "next/server";
import { getTitulosPorIds } from "@/lib/devops-client";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Título/tipo dos PBIs pai das Tasks, pro panel "Alocação por sprint" (pedido por Heder em
 * 2026-10-13). POST com { ids: number[] } (a lista passa de centenas de ids — não cabe bem numa
 * query string). Carregado só quando o panel abre, pra não pesar a aba Sprints inteira.
 */
export async function POST(request: NextRequest) {
  const { ids } = (await request.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(ids) || ids.some((n) => typeof n !== "number")) {
    return NextResponse.json({ erro: "ids deve ser uma lista de números." }, { status: 400 });
  }
  try {
    const pais = await getTitulosPorIds(ids as number[]);
    return NextResponse.json({ pais });
  } catch (err) {
    console.error("[roadmap/pais] falha ao buscar títulos dos PBIs pai:", err);
    const detalhe = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return NextResponse.json({ erro: "Não foi possível carregar os PBIs pai.", detalhe, pais: {} }, { status: 502 });
  }
}

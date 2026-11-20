import { NextResponse } from "next/server";
import { getFluxoPoUpstream } from "@/lib/devops-client";
import { getUsuarioAtual } from "@/lib/auth-server";
import { podeMovimentar, projetoSuportado } from "@/lib/fluxo-po";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Quadro do Fluxo do PO (Upstream) — SÓ LEITURA. Query: `?projeto=KMM5` (o fluxo existe só no KMM5; outro projeto
 * volta vazio com aviso) e `?esteira=KMM5\TMS - Dedicada Maroni` (opcional; sempre inclui a raiz KMM5 = etapa 1.1).
 * `podeMovimentar` só orienta a tela; a gravação (tarefa futura) revalida a permissão no servidor.
 */
export async function GET(req: Request) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const url = new URL(req.url);
  const projeto = url.searchParams.get("projeto") ?? "KMM5";
  const podeMover = podeMovimentar(usuario.papel, usuario.tipo);
  if (!projetoSuportado(projeto)) {
    return NextResponse.json({ cards: [], esteiras: [], podeMovimentar: podeMover, avisos: [`O Fluxo do PO existe só no KMM5 (projeto selecionado: ${projeto}).`] });
  }

  try {
    const dados = await getFluxoPoUpstream(url.searchParams.get("esteira"));
    return NextResponse.json({ ...dados, podeMovimentar: podeMover });
  } catch (err) {
    console.error("[fluxo-po/upstream] falha:", err);
    return NextResponse.json({ erro: "Não foi possível carregar o quadro do Azure DevOps.", cards: [], esteiras: [], podeMovimentar: podeMover, avisos: [] }, { status: 502 });
  }
}

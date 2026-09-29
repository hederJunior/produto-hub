import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Move 1 dev entre slots do board de capacidade (arrastar e soltar, pedido por Heder em
 * 2026-09-29): tira do slot de origem (se houver) e/ou coloca no slot de destino (se houver).
 * Cobre os 3 casos de drag-and-drop:
 * - pool → squad/sprint: só `sprintDestino`+`squadDestino` (sem `sprintOrigem`).
 * - squad/sprint → squad/sprint (mesma ou outra sprint): os 3 campos.
 * - squad/sprint → pool: só `sprintOrigem` (sem destino) — apaga só a alocação daquela sprint;
 *   o dev volta a aparecer no pool "Desenvolvedores disponíveis" quando não sobrar nenhuma
 *   alocação sua em nenhuma sprint (ver GET /api/capacidade).
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { devId, produto, sprintOrigem, sprintDestino, squadDestino } = body as {
    devId?: string;
    produto?: string;
    sprintOrigem?: string | null;
    sprintDestino?: string | null;
    squadDestino?: string | null;
  };

  if (!devId || !produto) {
    return NextResponse.json({ erro: "devId e produto são obrigatórios." }, { status: 400 });
  }

  const supabase = getServiceClient();

  if (sprintOrigem) {
    const { error } = await supabase
      .from("AlocacaoCapacidade")
      .delete()
      .eq("devId", devId)
      .eq("sprint", sprintOrigem);
    if (error) {
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }
  }

  if (sprintDestino && squadDestino) {
    // "id" gerado aqui (não pelo banco) — mesmo motivo do comentário em
    // app/api/capacidade/auto-alocar/route.ts.
    const { error } = await supabase
      .from("AlocacaoCapacidade")
      .upsert(
        { id: randomUUID(), devId, produto, sprint: sprintDestino, squad: squadDestino },
        { onConflict: "devId,sprint" }
      );
    if (error) {
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

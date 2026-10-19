import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getUsuarioAtual } from "@/lib/auth-server";
import { notaValida, STATUS_AVALIACAO } from "@/lib/priorizacao-gut";

export const dynamic = "force-dynamic";

const MAX_TEXTO = 4000;

/**
 * Grava (upsert) a avaliação GUT de um PBI. Só administradores (decisão de Heder, 2026-10-19).
 * Valida: notas = null ou inteiro 1–5; status ∈ STATUS_AVALIACAO; textos ≤ 4000 caracteres.
 * Pontuação/prioridade não são gravadas (calculadas na leitura).
 */
export async function POST(request: NextRequest) {
  const usuario = await getUsuarioAtual();
  if (usuario?.tipo !== "adm") {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nota = (v: unknown) => (v === null || v === undefined || v === "" ? null : v);
  const g = nota(b.gravidade), u = nota(b.urgencia), t = nota(b.tendencia);

  if (!Number.isInteger(b.workItemId) || (b.workItemId as number) <= 0) {
    return NextResponse.json({ erro: "workItemId inválido." }, { status: 400 });
  }
  for (const [rotulo, v] of [["Gravidade", g], ["Urgência", u], ["Tendência", t]] as const) {
    if (v !== null && !notaValida(v)) return NextResponse.json({ erro: `${rotulo} deve ser um inteiro de 1 a 5.` }, { status: 400 });
  }
  if (typeof b.status !== "string" || !(STATUS_AVALIACAO as readonly string[]).includes(b.status)) {
    return NextResponse.json({ erro: "Status da avaliação inválido." }, { status: 400 });
  }
  const justificativa = typeof b.justificativa === "string" ? b.justificativa : "";
  const acao = typeof b.acao === "string" ? b.acao : "";
  if (justificativa.length > MAX_TEXTO || acao.length > MAX_TEXTO) {
    return NextResponse.json({ erro: `Texto muito longo (máx. ${MAX_TEXTO} caracteres).` }, { status: 400 });
  }

  const agora = new Date().toISOString();
  const { error } = await getServiceClient()
    .from("PriorizacaoGut")
    .upsert(
      {
        workItemId: b.workItemId,
        gravidade: g,
        urgencia: u,
        tendencia: t,
        justificativa,
        acao,
        status: b.status,
        atualizadoPor: usuario.email,
        atualizadoEm: agora,
      },
      { onConflict: "workItemId" }
    );
  if (error) {
    console.error("[priorizacao-gut/avaliacao] falha ao gravar:", error);
    return NextResponse.json({ erro: "Não foi possível salvar a avaliação." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, atualizadoPor: usuario.email, atualizadoEm: agora });
}

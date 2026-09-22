import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { ehAdmin } from "@/lib/auth-server";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

/** Histórico das últimas execuções do JOB de captura, mais recente primeiro (AC-3). */
export async function GET() {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("JobExecucao")
    .select("id, tipo, iniciadoEm, finalizadoEm, status, itensCapturados, erro")
    .order("iniciadoEm", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ execucoes: data ?? [] });
}

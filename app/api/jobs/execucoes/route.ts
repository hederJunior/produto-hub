import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { ehAdmin } from "@/lib/auth-server";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

/**
 * Histórico das últimas execuções, mais recente primeiro (AC-3). Sem parâmetro: JOB de captura. Com `?job=bloqueio-clientes`:
 * o JOB de bloqueio de clientes (tipos "bloqueio-clientes" e "bloqueio-clientes-manual").
 */
export async function GET(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const supabase = getServiceClient();
  const bloqueio = request.nextUrl.searchParams.get("job") === "bloqueio-clientes";
  const consulta = supabase.from("JobExecucao").select("id, tipo, iniciadoEm, finalizadoEm, status, itensCapturados, erro");
  const { data, error } = await (bloqueio ? consulta.like("tipo", "bloqueio-clientes%") : consulta.not("tipo", "like", "bloqueio-clientes%"))
    .order("iniciadoEm", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ execucoes: data ?? [] });
}

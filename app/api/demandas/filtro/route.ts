import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

const ROW_ID = "default";

/**
 * Setup de filtros salvo do dashboard de indicadores (botão "Salvar Filtros") — linha única
 * "default", compartilhada com o time (mesmo padrão de PainelEstado/JobConfig).
 */
export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("FiltroPainelIndicadores")
    .select("cliente, squads, dataInicio, dataFim")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? { cliente: null, squads: [], dataInicio: null, dataFim: null });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const cliente: string | null = body.cliente || null;
  const squads: string[] = Array.isArray(body.squads) ? body.squads : [];
  const dataInicio: string | null = body.dataInicio || null;
  const dataFim: string | null = body.dataFim || null;

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("FiltroPainelIndicadores")
    .upsert({ id: ROW_ID, cliente, squads, dataInicio, dataFim, atualizadoEm: new Date().toISOString() }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

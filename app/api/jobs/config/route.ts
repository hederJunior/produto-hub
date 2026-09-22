import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { ehAdmin } from "@/lib/auth-server";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

const ROW_ID = "default";

/**
 * Config do JOB de captura (AC-3). horario/frequencia são apenas informativos aqui — a decisão
 * de arquitetura (2026-09-19) foi cron fixo simples: quem controla o horário real de disparo é
 * o `vercel.json` (schedule do cron), mudar exige redeploy. O único campo que a interface
 * controla de fato é `ativo` (kill-switch, lido pela rota /api/jobs/captura antes de rodar).
 */
export async function GET() {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("JobConfig")
    .select("ativo, frequencia, horario, atualizadoEm")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  // Sem linha ainda: os defaults do schema (ativo=true, diaria, 06:00) valem até a 1ª gravação.
  return NextResponse.json(data ?? { ativo: true, frequencia: "diaria", horario: "06:00" });
}

export async function PUT(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const { ativo } = (await request.json()) as { ativo: boolean };
  if (typeof ativo !== "boolean") {
    return NextResponse.json({ erro: "Campo 'ativo' (boolean) é obrigatório." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("JobConfig")
    .upsert({ id: ROW_ID, ativo, atualizadoEm: new Date().toISOString() }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

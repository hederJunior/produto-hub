import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

const ROW_ID = "default";

/**
 * Backend do componente PainelIndicadores (portado do artifact original).
 * Substitui o storage por-navegador do Artifact por uma linha única compartilhada
 * na tabela PainelEstado — assim o time inteiro edita e enxerga o mesmo dado.
 *
 * Nota: usa o client Supabase diretamente (mesma tabela do Prisma) em vez do Prisma Client
 * para evitar puxar o runtime do Prisma nas rotas serverless do Vercel. Se preferir Prisma aqui,
 * troque por `new PrismaClient()` com o mesmo modelo.
 */
export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("PainelEstado")
    .select("data, th, history")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  // Sem linha ainda: o componente usa seus próprios valores padrão (DEFAULT_DATA/DEFAULT_TH)
  return NextResponse.json(data ?? {});
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { data, th, history } = body;

  const supabase = getServiceClient();
  const { error } = await supabase
    // atualizadoEm é @updatedAt no Prisma (sem default no banco) — como este upsert passa por
    // fora do Prisma Client, precisa ser setado explicitamente ou o 1º insert (linha "default"
    // ainda não existente) falha por violação de NOT NULL. Achado em 2026-09-19 ao implementar
    // o mesmo padrão de upsert em JobConfig.
    .from("PainelEstado")
    .upsert({ id: ROW_ID, data, th, history, atualizadoEm: new Date().toISOString() }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

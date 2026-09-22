import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const produto = request.nextUrl.searchParams.get("produto")?.toUpperCase();
  const supabase = getServiceClient();

  let query = supabase.from("Cliente").select("*").order("nome", { ascending: true });
  if (produto && produto !== "AMBOS") query = query.eq("produto", produto);

  const { data, error } = await query;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ clientes: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { nome, produto, responsavel, ultimoContato, situacao } = body;

  if (!nome || !produto) {
    return NextResponse.json({ erro: "Informe ao menos nome e produto." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("Cliente")
    .insert({ id: randomUUID(), nome, produto, responsavel, ultimoContato, situacao: situacao ?? "EM_DIA" })
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ cliente: data });
}

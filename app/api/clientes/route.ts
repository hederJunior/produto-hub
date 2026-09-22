import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase";

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

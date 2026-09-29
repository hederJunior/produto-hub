import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase";
import { ehAdmin } from "@/lib/auth-server";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão). Sem isso, o Next.js tenta gerar como página estática no build qualquer
// rota GET que não use request/cookies/headers diretamente.
export const dynamic = "force-dynamic";

/**
 * CRUD do roster de devs (DevCapacidade), pedido por Heder em 2026-09-30: base cadastrada
 * manualmente em Administração > Cadastro de devs, que alimenta tanto o pool "Desenvolvedores
 * disponíveis" quanto o select de dev na nova função "Cadastrar disponibilidade" do painel
 * "Planejamento de capacidade" — sem depender só de Task/Bug já atribuída no Azure DevOps, que é
 * como o roster era populado até então (auto-alocação a partir de Task/Bug reais).
 *
 * Mesma tabela DevCapacidade usada pela auto-alocação — não é um cadastro separado; um dev criado
 * aqui manualmente convive normalmente com os criados automaticamente (upsert por [produto,nome]
 * evita duplicar se o mesmo nome já existir vindo do Azure DevOps).
 *
 * GET é público pra qualquer usuário logado (o board de capacidade precisa ler o roster);
 * POST/PUT/DELETE exigem admin (mesmo padrão de app/api/jobs/captura/route.ts).
 */
export async function GET(request: NextRequest) {
  const produto = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "KMM5";
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("DevCapacidade")
    .select("id, nome, papel, produto")
    .eq("produto", produto)
    .order("nome");
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ devs: data ?? [] }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
}

export async function POST(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const { produto, nome, papel } = await request.json();
  if (!produto || typeof nome !== "string" || !nome.trim()) {
    return NextResponse.json({ erro: "produto e nome são obrigatórios." }, { status: 400 });
  }

  const supabase = getServiceClient();
  // "id" e "atualizadoEm" gerados aqui, não pelo banco — mesmo motivo já documentado em
  // app/api/capacidade/auto-alocar/route.ts (@default(uuid())/@updatedAt do Prisma só existem
  // pro Prisma Client; toda escrita em runtime passa pelo client do Supabase).
  const { error } = await supabase.from("DevCapacidade").insert({
    id: randomUUID(),
    produto,
    nome: nome.trim(),
    papel: papel || null,
    atualizadoEm: new Date().toISOString(),
  });
  if (error) {
    const mensagem = error.code === "23505" ? "Já existe um dev com esse nome nesse produto." : error.message;
    return NextResponse.json({ erro: mensagem }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const { id, nome, papel } = await request.json();
  if (!id || typeof nome !== "string" || !nome.trim()) {
    return NextResponse.json({ erro: "id e nome são obrigatórios." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("DevCapacidade")
    .update({ nome: nome.trim(), papel: papel || null, atualizadoEm: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    const mensagem = error.code === "23505" ? "Já existe um dev com esse nome nesse produto." : error.message;
    return NextResponse.json({ erro: mensagem }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ erro: "id é obrigatório." }, { status: 400 });
  }
  const supabase = getServiceClient();
  // AlocacaoCapacidade.devId tem onDelete: Cascade (ver prisma/schema.prisma) — apagar o dev aqui
  // já remove junto qualquer alocação dele em squad/sprint, sem precisar apagar em 2 passos.
  const { error } = await supabase.from("DevCapacidade").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

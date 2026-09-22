import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase";
import { getUsuarioAtual, ehAdmin } from "@/lib/auth-server";

const PAINEIS_VALIDOS = ["FLUXO_DEMANDAS", "AGGING_VIABILIDADE", "BACKLOG_VIABILIDADE"] as const;
type Painel = (typeof PAINEIS_VALIDOS)[number];

/**
 * CRUD dos valores mensais digitados manualmente (REQ01.06), pra preencher histórico anterior ao
 * início do JOB de captura automática. Uma tabela única (IndicadorManual) cobre os 3 painéis —
 * ver justificativa no comentário do model, em prisma/schema.prisma. Restrito a admin desde
 * 2026-09-20 (a tela migrou pra dentro de Administração, a pedido de Heder) — antes qualquer
 * usuário logado podia usar.
 */
export async function GET(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const params = request.nextUrl.searchParams;
  const produto = params.get("produto");
  const painel = params.get("painel");

  if (!produto || !painel || !PAINEIS_VALIDOS.includes(painel as Painel)) {
    return NextResponse.json({ erro: "Informe 'produto' e 'painel' válidos." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("IndicadorManual")
    .select("*")
    .eq("produto", produto)
    .eq("painel", painel)
    .order("mes", { ascending: false });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ itens: data ?? [] });
}

export async function POST(request: NextRequest) {
  const usuario = await getUsuarioAtual();
  if (!usuario || usuario.tipo !== "adm") {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }

  const body = await request.json();
  const { produto, painel, mes, abertas, encerradas, canceladas, agingMedio, backlogQtd, observacao } = body ?? {};

  if (!produto || !painel || !mes || !PAINEIS_VALIDOS.includes(painel)) {
    return NextResponse.json({ erro: "Informe 'produto', 'painel' e 'mes' (YYYY-MM)." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ erro: "Campo 'mes' deve estar no formato YYYY-MM." }, { status: 400 });
  }

  const agora = new Date().toISOString();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("IndicadorManual")
    .upsert(
      {
        id: randomUUID(),
        produto,
        painel,
        mes,
        abertas: abertas ?? null,
        encerradas: encerradas ?? null,
        canceladas: canceladas ?? null,
        agingMedio: agingMedio ?? null,
        backlogQtd: backlogQtd ?? null,
        observacao: observacao ?? null,
        criadoPor: usuario.email,
        criadoEm: agora,
        atualizadoEm: agora,
      },
      { onConflict: "produto,painel,mes" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}

export async function PUT(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const body = await request.json();
  const { id, abertas, encerradas, canceladas, agingMedio, backlogQtd, observacao } = body ?? {};
  if (!id) {
    return NextResponse.json({ erro: "Informe 'id'." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("IndicadorManual")
    .update({
      abertas: abertas ?? null,
      encerradas: encerradas ?? null,
      canceladas: canceladas ?? null,
      agingMedio: agingMedio ?? null,
      backlogQtd: backlogQtd ?? null,
      observacao: observacao ?? null,
      atualizadoEm: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}

export async function DELETE(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ erro: "Informe 'id'." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { error } = await supabase.from("IndicadorManual").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

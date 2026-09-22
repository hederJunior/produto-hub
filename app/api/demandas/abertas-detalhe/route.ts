import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { chaveMes, SEM_CLIENTE } from "@/lib/demandas-agregacao";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

/**
 * Detalhe dos itens por trás do número "ABERTAS" do painel Fluxo de Demandas — botão "Demandas
 * Abertas" (pedido por Heder em 2026-09-20). Lê de DemandaAtual, aplica os mesmos filtros de
 * Produto/Cliente/Squad/Data já usados na tela, e filtra em memória pelo mês de Created Date
 * (`mes`, obrigatório, formato "YYYY-MM") — o mesmo mês que o KPI está mostrando no momento
 * (calculado no frontend a partir do último ponto da série de fluxoDemandas).
 *
 * NÃO filtra por State (RN02.10, ver lib/demandas-agregacao.ts): um item cancelado no mesmo mês
 * em que foi aberto continua aparecendo aqui, com o State atual visível na tabela — é a mesma
 * regra que `calcularFluxoDemandas` usa pra contar "abertas".
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const produto = params.get("produto")?.toUpperCase();
  const cliente = params.get("cliente");
  const squadsFiltro = params.getAll("squad");
  const dataInicio = params.get("dataInicio");
  const dataFim = params.get("dataFim");
  const mes = params.get("mes");

  if (!mes) {
    return NextResponse.json({ erro: "Parâmetro 'mes' (YYYY-MM) é obrigatório." }, { status: 400 });
  }

  const supabase = getServiceClient();
  let query = supabase
    .from("DemandaAtual")
    .select("workItemId, produto, cliente, squad, state, etapa, descricao, classificacao, createdDate, closedDate");

  if (produto && produto !== "AMBOS") query = query.eq("produto", produto);
  if (cliente === SEM_CLIENTE) query = query.is("cliente", null);
  else if (cliente) query = query.eq("cliente", cliente);
  if (squadsFiltro.length) query = query.in("squad", squadsFiltro);
  if (dataInicio) query = query.gte("createdDate", dataInicio);
  if (dataFim) query = query.lte("createdDate", dataFim);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const itens = (data ?? []).filter((i) => chaveMes(i.createdDate) === mes);
  return NextResponse.json({ itens });
}

import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { CLIENTE_EXCLUIDO_VIABILIDADE, SEM_CLIENTE } from "@/lib/demandas-agregacao";

/**
 * Detalhe dos itens por trás do indicador "Aging de Viabilidade" (botão "Detalhes" do painel) —
 * lê de DemandaAtual (rollup de 1 linha por item, ver docs/decisoes-e-conhecimento.md de
 * 2026-09-20), filtrado a State = "Backlog" e excluindo o cliente "KMM (INTERNO)" (mesma regra
 * do cálculo do indicador).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const produto = params.get("produto")?.toUpperCase();
  const cliente = params.get("cliente");
  const squadsFiltro = params.getAll("squad");
  const dataInicio = params.get("dataInicio");
  const dataFim = params.get("dataFim");

  const supabase = getServiceClient();
  let query = supabase
    .from("DemandaAtual")
    .select("workItemId, produto, cliente, squad, state, etapa, descricao, classificacao, dataAberturaProduto, createdDate, agingDias")
    .eq("state", "Backlog");

  if (produto && produto !== "AMBOS") query = query.eq("produto", produto);
  if (cliente === SEM_CLIENTE) query = query.is("cliente", null);
  else if (cliente) query = query.eq("cliente", cliente);
  if (squadsFiltro.length) query = query.in("squad", squadsFiltro);
  if (dataInicio) query = query.gte("createdDate", dataInicio);
  if (dataFim) query = query.lte("createdDate", dataFim);

  const { data, error } = await query.order("agingDias", { ascending: false });
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  // Filtro em memória, não na query: um .neq() no Postgres exclui também as linhas com cliente
  // nulo (NULL <> 'x' não é verdadeiro em SQL), o que apagaria itens sem cliente preenchido.
  const itens = (data ?? []).filter((i) => i.cliente !== CLIENTE_EXCLUIDO_VIABILIDADE);

  return NextResponse.json({ itens });
}

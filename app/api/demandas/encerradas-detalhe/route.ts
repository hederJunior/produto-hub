import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { chaveMes, classificarEncerramento, SEM_CLIENTE } from "@/lib/demandas-agregacao";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

/**
 * Detalhe dos itens por trás do número "ENCERRADAS" do painel Fluxo de Demandas — botão
 * "Demandas Encerradas" (pedido por Heder em 2026-09-20, espelhando o "Demandas Abertas" já
 * existente — mesmo layout e nível de detalhe). Lê de DemandaAtual, aplica os filtros de
 * Produto/Cliente/Squad já usados na tela, e filtra em memória por mês de Closed Date (`mes`,
 * obrigatório) + State classificado como "encerrada" via `classificarEncerramento` — a mesma regra
 * que `calcularFluxoDemandas` usa pra contar "encerradas". Não inclui canceladas (essas já têm o
 * próprio número "NEGADAS/CANC." separado no painel).
 *
 * NÃO filtra por Created Date (bug corrigido em 2026-09-28, achado por Heder: itens #7841/#8180,
 * criados em jan/26 e encerrados em set/26, sumiam da lista com o filtro de Data "a partir de
 * mar/26" ativo — mesma causa documentada em lib/demandas-agregacao.ts). O `mes` já vem de um
 * ponto da série "encerradas" de calcularFluxoDemandas, que agora só inclui meses dentro do
 * intervalo de Data filtrado em Closed Date — então não precisa (e não deve) filtrar de novo por
 * Created Date aqui.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const produto = params.get("produto")?.toUpperCase();
  const cliente = params.get("cliente");
  const squadsFiltro = params.getAll("squad");
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

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const itens = (data ?? []).filter(
    (i) => i.closedDate && classificarEncerramento(i.state) === "encerrada" && chaveMes(i.closedDate) === mes
  );
  return NextResponse.json({ itens });
}

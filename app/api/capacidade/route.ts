import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

/**
 * Estado da tela "Planejamento de capacidade" (Roadmap > Sprints, pedido por Heder em
 * 2026-09-29): roster de devs + alocações (dev × sprint × squad).
 *
 * NÃO devolve a lista de squads (Area Path) — o frontend monta as colunas a partir do Area Path
 * real dos Task/Bug carregados em /api/roadmap/tarefas (mesma fonte que a aba Sprints já usa pro
 * filtro de área), não de DEVOPS_PROJETOS[produto].areaPaths. Achado testando com dados reais de
 * KMM5 em 2026-09-29: essa lista fixa é usada só nos WIQL de Epics/PBI (getEpicIds,
 * fetchPbisParaSnapshot) — Task/Bug (getTasksAlocadas) não filtra por Area Path, e boa parte dos
 * itens reais está numa squad ("KMM5\TMS - Cabotagem - Maersk") que nem consta na lista fixa.
 * Usar essa lista aqui deixaria a maioria das alocações "fantasma" (contando em "alocados" mas
 * sem coluna nenhuma pra aparecer).
 */
export async function GET(request: NextRequest) {
  const produto = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "KMM5";

  const supabase = getServiceClient();
  const { data: devs, error: erroDevs } = await supabase
    .from("DevCapacidade")
    .select("id, nome, papel")
    .eq("produto", produto)
    .order("nome");
  if (erroDevs) {
    return NextResponse.json({ erro: erroDevs.message }, { status: 500 });
  }

  const { data: alocacoes, error: erroAlocacoes } = await supabase
    .from("AlocacaoCapacidade")
    .select("id, devId, sprint, squad")
    .eq("produto", produto);
  if (erroAlocacoes) {
    return NextResponse.json({ erro: erroAlocacoes.message }, { status: 500 });
  }

  // Cabeçalho explícito de no-cache (achado por Heder em 2026-09-29): confirmado que o POST de
  // auto-alocar grava certo no Supabase (conferido direto no banco), mas o GET seguinte, em
  // produção, devolvia 0 devs / 0 alocações mesmo sendo a chamada mais recente (não descartada
  // pela guarda de corrida do frontend) — só reproduzível em produção, nunca localmente, o que
  // aponta pra alguma camada de cache HTTP (CDN/edge da Vercel) na frente da function, já que
  // `dynamic = "force-dynamic"` evita cache do próprio Next.js mas não necessariamente da CDN.
  return NextResponse.json(
    { devs: devs ?? [], alocacoes: alocacoes ?? [] },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}

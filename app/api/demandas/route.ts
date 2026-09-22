import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import {
  calcularFluxoDemandas, calcularAgingViabilidade, calcularBacklogViabilidade,
  mesclarFluxoComManual, mesclarValorComManual, SEM_CLIENTE,
} from "@/lib/demandas-agregacao";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

/**
 * Fonte de dados do dashboard automático (PRD F01.01 - Painel Indicadores): filtros operacionais
 * (Data/Cliente/Squad) + os três painéis (Fluxo de demandas, Aging de Viabilidade, Backlog de
 * Viabilidade).
 *
 * Lê de DemandaAtual (1 linha por item) e DemandaMensal (1 linha por item+mês) — as tabelas de
 * rollup que o JOB de captura mantém — em vez do log bruto DemandaSnapshot, que crescia ~1700
 * linhas/dia e ficou lento de agregar em memória (ver docs/decisoes-e-conhecimento.md, entrada
 * de 2026-09-20). Essas duas tabelas são limitadas pela quantidade de itens (~1700 hoje), não
 * pelo tempo decorrido, então não têm o mesmo problema de crescimento.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const produto = params.get("produto")?.toUpperCase();
  const cliente = params.get("cliente");
  const squadsFiltro = params.getAll("squad");
  const dataInicio = params.get("dataInicio");
  const dataFim = params.get("dataFim");

  const supabase = getServiceClient();

  let queryAtual = supabase
    .from("DemandaAtual")
    .select("workItemId, cliente, squad, state, createdDate, closedDate, agingDias");
  if (produto && produto !== "AMBOS") queryAtual = queryAtual.eq("produto", produto);
  if (cliente === SEM_CLIENTE) queryAtual = queryAtual.is("cliente", null);
  else if (cliente) queryAtual = queryAtual.eq("cliente", cliente);
  if (squadsFiltro.length) queryAtual = queryAtual.in("squad", squadsFiltro);
  if (dataInicio) queryAtual = queryAtual.gte("createdDate", dataInicio);
  if (dataFim) queryAtual = queryAtual.lte("createdDate", dataFim);

  const { data: atuaisData, error: erroAtual } = await queryAtual;
  if (erroAtual) {
    return NextResponse.json({ erro: erroAtual.message }, { status: 500 });
  }
  const itensAtuais = atuaisData ?? [];

  // Opções dos dropdowns de filtro + limites de data pro slider: sempre a partir só do produto
  // selecionado (ignora cliente/squad já escolhidos — senão as próprias opções/limites encolheriam
  // a cada seleção, o que faria o slider "andar" sozinho enquanto o usuário mexe nos outros filtros).
  let queryFiltros = supabase.from("DemandaAtual").select("cliente, squad, createdDate");
  if (produto && produto !== "AMBOS") queryFiltros = queryFiltros.eq("produto", produto);
  const { data: dadosFiltros } = await queryFiltros;
  // Itens sem Custom.Cliente preenchido não podem ficar invisíveis no filtro (pedido de Heder em
  // 2026-09-20) — entram no dropdown como a opção "Sem cliente" (SEM_CLIENTE), que ao ser
  // selecionada filtra por cliente NULL (ver acima). Sem filtro de cliente selecionado, esses
  // itens já contam normalmente — isso só afeta a lista de opções do dropdown.
  const clientesComValor = [...new Set((dadosFiltros ?? []).map((r) => r.cliente).filter(Boolean) as string[])].sort();
  const temSemCliente = (dadosFiltros ?? []).some((r) => !r.cliente);
  const clientes = temSemCliente ? [...clientesComValor, SEM_CLIENTE] : clientesComValor;
  const squads = [...new Set((dadosFiltros ?? []).map((r) => r.squad).filter(Boolean) as string[])].sort();
  const datasCriacao = (dadosFiltros ?? []).map((r) => r.createdDate).filter(Boolean).sort();
  const dataMin = datasCriacao[0]?.slice(0, 10) ?? null;
  const dataMax = datasCriacao[datasCriacao.length - 1]?.slice(0, 10) ?? null;

  const fluxoDemandas = calcularFluxoDemandas(itensAtuais);

  // Histórico mensal (Aging/Backlog de Viabilidade), a partir de DemandaMensal. Filtra por
  // produto/cliente/squad diretamente; o filtro de Data (Created Date) não existe nessa tabela,
  // então só é aplicado (via lista de ids já filtrados acima) quando o usuário de fato o usa —
  // no caso comum (sem filtro de data), evita um IN com centenas/milhares de ids.
  let queryMensal = supabase.from("DemandaMensal").select("mes, cliente, squad, state, agingDias");
  if (produto && produto !== "AMBOS") queryMensal = queryMensal.eq("produto", produto);
  if (cliente === SEM_CLIENTE) queryMensal = queryMensal.is("cliente", null);
  else if (cliente) queryMensal = queryMensal.eq("cliente", cliente);
  if (squadsFiltro.length) queryMensal = queryMensal.in("squad", squadsFiltro);
  if (dataInicio || dataFim) {
    const idsFiltrados = itensAtuais.map((i) => i.workItemId);
    queryMensal = queryMensal.in("workItemId", idsFiltrados.length ? idsFiltrados : [-1]);
  }

  const { data: mensalData, error: erroMensal } = await queryMensal;
  if (erroMensal) {
    return NextResponse.json({ erro: erroMensal.message }, { status: 500 });
  }

  let agingViabilidade = calcularAgingViabilidade(mensalData ?? []);
  let backlogViabilidade = calcularBacklogViabilidade(mensalData ?? []);
  let fluxoComManual = fluxoDemandas;

  // Sobrepõe histórico digitado manualmente (REQ01.06, IndicadorManual). Por pedido explícito de
  // Heder em 2026-09-20, isso NÃO respeita filtro de Cliente/Squad (o dado manual não tem essa
  // granularidade — ver lib/demandas-agregacao.ts — mas entra sempre, não só quando os filtros
  // estão limpos). O que de fato filtra o dado manual é a Data: um mês fora do intervalo
  // dataInicio/dataFim selecionado não entra. Sem filtro de produto ou com "AMBOS", soma os dois.
  {
    let queryManual = supabase.from("IndicadorManual").select("produto, painel, mes, abertas, encerradas, canceladas, agingMedio, backlogQtd");
    if (produto && produto !== "AMBOS") queryManual = queryManual.eq("produto", produto);
    const { data: manualData } = await queryManual;
    const mesInicio = dataInicio ? dataInicio.slice(0, 7) : null;
    const mesFim = dataFim ? dataFim.slice(0, 7) : null;
    const linhas = (manualData ?? []).filter((l) => (!mesInicio || l.mes >= mesInicio) && (!mesFim || l.mes <= mesFim));

    const somarPorMes = (itens: typeof linhas, campo: "abertas" | "encerradas" | "canceladas" | "backlogQtd") => {
      const mapa = new Map<string, number>();
      for (const l of itens) {
        const v = l[campo];
        if (v == null) continue;
        mapa.set(l.mes, (mapa.get(l.mes) ?? 0) + v);
      }
      return [...mapa.entries()].map(([mes, valor]) => ({ mes, valor }));
    };
    const mediarPorMes = (itens: typeof linhas) => {
      const mapa = new Map<string, { soma: number; qtd: number }>();
      for (const l of itens) {
        if (l.agingMedio == null) continue;
        const atual = mapa.get(l.mes) ?? { soma: 0, qtd: 0 };
        atual.soma += l.agingMedio;
        atual.qtd += 1;
        mapa.set(l.mes, atual);
      }
      return [...mapa.entries()].map(([mes, { soma, qtd }]) => ({ mes, valor: Math.round(soma / qtd) }));
    };

    const manuaisFluxo = linhas.filter((l) => l.painel === "FLUXO_DEMANDAS");
    const abertasM = somarPorMes(manuaisFluxo, "abertas");
    const encerradasM = somarPorMes(manuaisFluxo, "encerradas");
    const canceladasM = somarPorMes(manuaisFluxo, "canceladas");
    const mesesFluxo = new Map<string, { abertas?: number; encerradas?: number; canceladas?: number }>();
    for (const { mes, valor } of abertasM) mesesFluxo.set(mes, { ...mesesFluxo.get(mes), abertas: valor });
    for (const { mes, valor } of encerradasM) mesesFluxo.set(mes, { ...mesesFluxo.get(mes), encerradas: valor });
    for (const { mes, valor } of canceladasM) mesesFluxo.set(mes, { ...mesesFluxo.get(mes), canceladas: valor });
    fluxoComManual = mesclarFluxoComManual(
      fluxoDemandas,
      [...mesesFluxo.entries()].map(([mes, v]) => ({ mes, ...v }))
    );

    agingViabilidade = mesclarValorComManual(agingViabilidade, mediarPorMes(linhas.filter((l) => l.painel === "AGGING_VIABILIDADE")));
    backlogViabilidade = mesclarValorComManual(backlogViabilidade, somarPorMes(linhas.filter((l) => l.painel === "BACKLOG_VIABILIDADE"), "backlogQtd"));
  }

  // Pedido por Heder em 2026-09-20: os números de destaque (ABERTAS/ENCERRADAS/NEGADAS-CANC. e
  // os "ATUAL" de Agging/Backlog) passam a mostrar só o ÚLTIMO MÊS que aparece no gráfico — não
  // mais a soma de todo o período (Fluxo) nem um valor "ao vivo" calculado à parte
  // (Agging/Backlog, que antes vinha de itensAtuais e podia divergir do último ponto da linha).
  // Já usa as séries FINAIS (depois da mesclagem com IndicadorManual), então o destaque sempre
  // bate com o que o gráfico desenha no ponto mais à direita.
  const ultimoIdxFluxo = fluxoComManual.meses.length - 1;
  const totais = {
    abertas: ultimoIdxFluxo >= 0 ? fluxoComManual.abertas[ultimoIdxFluxo] : 0,
    encerradas: ultimoIdxFluxo >= 0 ? fluxoComManual.encerradas[ultimoIdxFluxo] : 0,
    canceladas: ultimoIdxFluxo >= 0 ? fluxoComManual.canceladas[ultimoIdxFluxo] : 0,
    agingAtual: agingViabilidade.valores.length ? agingViabilidade.valores[agingViabilidade.valores.length - 1] : 0,
    backlogAtual: backlogViabilidade.valores.length ? backlogViabilidade.valores[backlogViabilidade.valores.length - 1] : 0,
  };

  return NextResponse.json({
    filtros: { clientes, squads, dataMin, dataMax },
    totais,
    fluxoDemandas: fluxoComManual,
    agingViabilidade,
    backlogViabilidade,
  });
}

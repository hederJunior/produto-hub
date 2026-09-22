/**
 * Agregações do dashboard de indicadores automáticos (PRD F01.01), a partir das tabelas de
 * rollup DemandaAtual (1 linha por item) e DemandaMensal (1 linha por item+mês) — não mais do
 * log bruto DemandaSnapshot, que ficou lento de escanear conforme cresce (ver
 * docs/decisoes-e-conhecimento.md, entrada de 2026-09-20). Como as duas tabelas já vêm
 * "reduzidas" (upsert garante 1 linha por chave), essas funções só agrupam/somam — não
 * precisam mais de nenhuma redução "pega o mais recente" em memória.
 */

/** Cliente fixo excluído dos painéis de viabilidade (Agging de Viabilidade — pedido original de
 * Heder em 2026-09-20 — e também Backlog de Viabilidade, estendido em 2026-09-20) — demandas
 * internas da própria KMM não devem contar nesses dois indicadores. NÃO afeta Fluxo de Demandas
 * (nunca foi pedido lá). Renomeado de CLIENTE_EXCLUIDO_AGING pra refletir o escopo maior. */
export const CLIENTE_EXCLUIDO_VIABILIDADE = "KMM (INTERNO)";

/** Valor sentinela do filtro de Cliente pra representar itens SEM Cliente preenchido
 * (`Custom.Cliente` vazio na Azure DevOps — acontece com itens técnicos/infra sem cliente
 * associado). Por pedido de Heder em 2026-09-20: esses itens não podem ficar de fora dos
 * indicadores nem do filtro só por terem o campo vazio — aparecem no dropdown como "Sem cliente"
 * e, quando selecionados, filtram por Cliente NULL em vez de igualdade de string (ver uso em
 * app/api/demandas/route.ts). Sem filtro nenhum selecionado (`cliente` vazio), esses itens já
 * contam normalmente nos totais — este sentinela só afeta o FILTRO, não a contagem padrão. */
export const SEM_CLIENTE = "Sem cliente";

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Chave "YYYY-MM" a partir de uma data ISO, pra agrupar por mês (usa UTC, mesma convenção das
 * datas vindas da Azure DevOps). */
export function chaveMes(dataIso: string): string {
  const d = new Date(dataIso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "set/26" a partir de uma chave "2026-09". */
export function mesLabel(chave: string): string {
  const [ano, mes] = chave.split("-").map(Number);
  return `${MESES_PT[mes - 1]}/${String(ano).slice(2)}`;
}

/**
 * Classifica um State de PBI como "encerrada" ou "cancelada" pro painel Fluxo de Demandas
 * (RN02.05/RN02.06). PROVISÓRIO: heurística por nome, até confirmarmos com
 * scripts/inspect-devops-states.mjs a categoria real (Completed/Removed) de cada estado
 * customizado de KMM4/KMM5. Um estado que não bate em nenhuma regra fica "em aberto" (não entra
 * em nenhuma das duas séries) — falha de forma segura (não classifica errado, só deixa de fora).
 */
export function classificarEncerramento(state: string): "encerrada" | "cancelada" | null {
  const s = (state ?? "").toLowerCase();
  if (!s) return null;
  if (/cancel|remov|negad|rejeit/.test(s)) return "cancelada";
  if (/closed|conclu|encerrad|finaliz|^done$/.test(s)) return "encerrada";
  return null;
}

function mesesOrdenados(chaves: Iterable<string>): string[] {
  return [...new Set(chaves)].sort();
}

export type ItemAtualFluxo = { createdDate: string; closedDate: string | null; state: string };
export type SerieFluxo = { meses: string[]; abertas: number[]; encerradas: number[]; canceladas: number[] };

/** Painel "Fluxo de demandas" (REQ02.02-06): abertas por mês de Created Date, encerradas/canceladas
 * por mês de Closed Date. Recebe linhas de DemandaAtual (1 por item) — createdDate/closedDate não
 * mudam depois de definidos, então o item mais atual já basta pro histórico completo. */
export function calcularFluxoDemandas(itens: ItemAtualFluxo[]): SerieFluxo {
  const abertasPorMes = new Map<string, number>();
  const encerradasPorMes = new Map<string, number>();
  const canceladasPorMes = new Map<string, number>();

  for (const item of itens) {
    // RN02.10 (Heder, 2026-09-20): "abertas" conta TODO item pelo mês de Created Date,
    // independente do State atual — inclusive itens cancelados/removidos depois de abertos.
    // Cancelar uma demanda não desfaz o fato de que ela foi aberta naquele mês. Por isso este
    // bloco não filtra por state (diferente de encerradas/canceladas, que dependem de
    // classificarEncerramento). NÃO adicionar filtro de state aqui — já foi confirmado com
    // Heder que essa é a regra correta pro indicador, não um bug.
    if (item.createdDate) {
      const mes = chaveMes(item.createdDate);
      abertasPorMes.set(mes, (abertasPorMes.get(mes) ?? 0) + 1);
    }
    const categoria = classificarEncerramento(item.state);
    if (categoria && item.closedDate) {
      const mes = chaveMes(item.closedDate);
      const alvo = categoria === "encerrada" ? encerradasPorMes : canceladasPorMes;
      alvo.set(mes, (alvo.get(mes) ?? 0) + 1);
    }
  }

  const meses = mesesOrdenados([...abertasPorMes.keys(), ...encerradasPorMes.keys(), ...canceladasPorMes.keys()]);
  return {
    meses,
    abertas: meses.map((m) => abertasPorMes.get(m) ?? 0),
    encerradas: meses.map((m) => encerradasPorMes.get(m) ?? 0),
    canceladas: meses.map((m) => canceladasPorMes.get(m) ?? 0),
  };
}

export type ItemMensal = { mes: string; state: string; agingDias: number | null; cliente?: string | null };
export type SerieMensalValor = { meses: string[]; valores: number[] };

/** Painel "Aging de Viabilidade" (REQ02.03-05, RN02.07-09): média de agingDias por mês, só dos
 * itens com State = "Backlog" — e, por pedido de Heder em 2026-09-20, excluindo o cliente
 * "KMM (INTERNO)". Recebe linhas de DemandaMensal (já 1 por item+mês, upsertadas pelo JOB). */
export function calcularAgingViabilidade(linhasMensal: ItemMensal[]): SerieMensalValor {
  const somaPorMes = new Map<string, { soma: number; qtd: number }>();

  for (const item of linhasMensal) {
    if (item.state !== "Backlog" || item.agingDias == null) continue;
    if (item.cliente === CLIENTE_EXCLUIDO_VIABILIDADE) continue;
    const atual = somaPorMes.get(item.mes) ?? { soma: 0, qtd: 0 };
    atual.soma += item.agingDias;
    atual.qtd += 1;
    somaPorMes.set(item.mes, atual);
  }

  const meses = mesesOrdenados(somaPorMes.keys());
  return { meses, valores: meses.map((m) => Math.round(somaPorMes.get(m)!.soma / somaPorMes.get(m)!.qtd)) };
}

/** Painel "Backlog de Viabilidade" (REQ02.06-08, RN02.10-11): contagem de itens com State =
 * "Backlog" por mês, excluindo o cliente "KMM (INTERNO)" (pedido por Heder em 2026-09-20 — antes
 * só o painel Agging excluía). Recebe linhas de DemandaMensal (já 1 por item+mês). */
export function calcularBacklogViabilidade(linhasMensal: ItemMensal[]): SerieMensalValor {
  const contagemPorMes = new Map<string, number>();

  for (const item of linhasMensal) {
    if (item.state !== "Backlog") continue;
    if (item.cliente === CLIENTE_EXCLUIDO_VIABILIDADE) continue;
    contagemPorMes.set(item.mes, (contagemPorMes.get(item.mes) ?? 0) + 1);
  }

  const meses = mesesOrdenados(contagemPorMes.keys());
  return { meses, valores: meses.map((m) => contagemPorMes.get(m) ?? 0) };
}

// --- Mesclagem com valores digitados manualmente (REQ01.06, IndicadorManual) ---------------
// Dados manuais são histórico anterior ao início do JOB (ou complemento de meses sem dado
// confiável no Azure DevOps): não têm granularidade de item, só produto+mês. Por pedido explícito
// de Heder em 2026-09-20, a mesclagem SEMPRE é aplicada, independente do filtro de Cliente/Squad
// (só o filtro de Data restringe quais meses manuais entram — ver app/api/demandas/route.ts).
// Regra de conflito: mês com valor manual sobrescreve o automático nesse mês (o valor foi
// digitado de propósito, geralmente pra corrigir ou preencher um buraco).

export type LinhaManualFluxo = { mes: string; abertas?: number | null; encerradas?: number | null; canceladas?: number | null };

export function mesclarFluxoComManual(serie: SerieFluxo, manuais: LinhaManualFluxo[]): SerieFluxo {
  const abertas = new Map(serie.meses.map((m, i) => [m, serie.abertas[i]]));
  const encerradas = new Map(serie.meses.map((m, i) => [m, serie.encerradas[i]]));
  const canceladas = new Map(serie.meses.map((m, i) => [m, serie.canceladas[i]]));

  for (const linha of manuais) {
    if (linha.abertas != null) abertas.set(linha.mes, linha.abertas);
    if (linha.encerradas != null) encerradas.set(linha.mes, linha.encerradas);
    if (linha.canceladas != null) canceladas.set(linha.mes, linha.canceladas);
  }

  const meses = mesesOrdenados([...abertas.keys(), ...encerradas.keys(), ...canceladas.keys()]);
  return {
    meses,
    abertas: meses.map((m) => abertas.get(m) ?? 0),
    encerradas: meses.map((m) => encerradas.get(m) ?? 0),
    canceladas: meses.map((m) => canceladas.get(m) ?? 0),
  };
}

export type LinhaManualValor = { mes: string; valor?: number | null };

export function mesclarValorComManual(serie: SerieMensalValor, manuais: LinhaManualValor[]): SerieMensalValor {
  const mapa = new Map(serie.meses.map((m, i) => [m, serie.valores[i]]));
  for (const linha of manuais) {
    if (linha.valor != null) mapa.set(linha.mes, linha.valor);
  }
  const meses = mesesOrdenados(mapa.keys());
  return { meses, valores: meses.map((m) => mapa.get(m)!) };
}


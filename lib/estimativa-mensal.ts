/**
 * Gestão de clientes > gráfico "Estimativa Total × 1,25 por mês" (pedido por Heder em 2026-11-24): para cada mês do campo
 * Activated Date, a soma do campo Estimativa Total dos PBIs, multiplicada por 1,25 para visualização. Só regras PURAS (sem
 * fetch). Os PBIs vêm da própria tela (cliente e squads já filtrados), então o gráfico acompanha os filtros.
 *
 * Decisões (registradas em docs/decisoes-e-conhecimento.md): entram só PBIs que têm Activated Date E Estimativa Total (os demais
 * são contados à parte, para a tela avisar); o mês é o de Brasília; o gráfico mostra os últimos 12 meses, o painel de detalhe
 * oferece todos os meses que têm demanda.
 */
import { chaveDia } from "./datas";
import type { PbiGestaoCliente } from "./gestao-clientes";

export const FATOR_ESTIMATIVA = 1.25;
export const MESES_NO_GRAFICO = 12;

const NOMES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const NOMES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-11" → "nov/26". */
export function rotuloCurtoDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMES_CURTOS[m - 1]}/${String(a).slice(2)}`;
}

/** "2026-11" → "novembro de 2026". */
export function rotuloLongoDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMES_LONGOS[m - 1]} de ${a}`;
}

/** Mês (AAAA-MM, fuso de Brasília) de um instante ISO; null se vazio ou inválido. */
export function mesDaAtivacao(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return chaveDia(d).slice(0, 7);
}

export type MesEstimativa = {
  /** AAAA-MM */
  mes: string;
  /** Soma da Estimativa Total dos PBIs do mês (sem o fator). */
  bruto: number;
  /** bruto × 1,25 — o valor do gráfico. */
  horas: number;
  itens: PbiGestaoCliente[];
};

/** O PBI entra no cálculo? (Activated Date válida e Estimativa Total preenchida.) */
export function entraNoCalculo(p: Pick<PbiGestaoCliente, "estimativaTotal" | "dataAtivacao">): boolean {
  return p.estimativaTotal != null && mesDaAtivacao(p.dataAtivacao) != null;
}

/** Agrupa por mês de ativação (ordem cronológica) e conta quantos PBIs ficaram de fora por falta de dado. */
export function agruparEstimativaPorMes(itens: readonly PbiGestaoCliente[]): { meses: MesEstimativa[]; semDados: number } {
  const porMes = new Map<string, MesEstimativa>();
  let semDados = 0;
  for (const p of itens) {
    if (!entraNoCalculo(p)) {
      semDados += 1;
      continue;
    }
    const mes = mesDaAtivacao(p.dataAtivacao)!;
    let m = porMes.get(mes);
    if (!m) {
      m = { mes, bruto: 0, horas: 0, itens: [] };
      porMes.set(mes, m);
    }
    m.itens.push(p);
    m.bruto += p.estimativaTotal!;
  }
  for (const m of porMes.values()) m.horas = m.bruto * FATOR_ESTIMATIVA;
  return { meses: Array.from(porMes.values()).sort((a, b) => a.mes.localeCompare(b.mes)), semDados };
}

/** AAAA-MM somado/subtraído de `delta` meses. */
function somarMeses(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const idx = a * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/**
 * Série do gráfico: os últimos `quantidade` meses até o mês de `agora`, sem buracos (mês sem demanda = 0 h), começando no
 * primeiro mês que tem dado (não desenha meses vazios antes do início do histórico). Vazia se não houver nenhum dado no período.
 */
export function serieDoGrafico(meses: readonly MesEstimativa[], agora: Date = new Date(), quantidade = MESES_NO_GRAFICO): MesEstimativa[] {
  const fim = chaveDia(agora).slice(0, 7);
  const inicioJanela = somarMeses(fim, -(quantidade - 1));
  const naJanela = meses.filter((m) => m.mes >= inicioJanela && m.mes <= fim);
  if (!naJanela.length) return [];
  const inicio = naJanela[0].mes;
  const porMes = new Map(naJanela.map((m) => [m.mes, m]));
  const serie: MesEstimativa[] = [];
  for (let mes = inicio; mes <= fim; mes = somarMeses(mes, 1)) serie.push(porMes.get(mes) ?? { mes, bruto: 0, horas: 0, itens: [] });
  return serie;
}

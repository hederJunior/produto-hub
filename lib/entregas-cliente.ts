/**
 * Gestão de clientes > "Demandas entregues" (pedido por Heder em 2026-11-04): últimos lançamentos de
 * versão, últimas demandas finalizadas e previsão de próximas entregas do cliente. Só tipos e regras
 * PURAS (sem fetch) — usado pela tela e pela consulta ao Azure (lib/devops-client.ts).
 */

/** Cliente cujos PBIs com Versão entram em todo cliente (releases internas que o cliente também recebe). */
export const CLIENTE_INTERNO = "KMM (INTERNO)";

export const LIMITE_LANCAMENTOS = 10;
export const LIMITE_FINALIZADAS = 5;

export type PbiEntrega = {
  id: number;
  /** Campo "ID Externo" (nº do chamado) — "" se vazio. */
  idExterno: string;
  /** TeamProject (KMM4/KMM5) — monta o link do PBI no Azure. */
  projeto: string;
  titulo: string;
  cliente: string;
  state: string;
  /** Versão normalizada ("8.17"); "" quando o campo não traz uma versão numérica. */
  versao: string;
  /** Texto original do campo Versão (vai no tooltip). */
  versaoBruta: string;
  /** Microsoft.VSTS.Common.ClosedDate (ISO) ou null. */
  closedDate: string | null;
  /** PBI do cliente KMM (INTERNO) exibido junto das versões do cliente selecionado. */
  interno: boolean;
};

/**
 * PBI em aberto programado para a sprint atual ou posterior (mesma regra de Downstream > Previsão de
 * Entregas): do cliente ou do KMM (INTERNO) — este só do(s) projeto(s) em que o cliente tem PBIs —,
 * Iteration = sprint que ainda não terminou.
 */
export type PbiPrevisaoCliente = {
  id: number;
  idExterno: string;
  projeto: string;
  titulo: string;
  cliente: string;
  state: string;
  /** Sprint = 3º nível da Iteration ("Sprint 8.20"). */
  sprint: string;
  /** Datas puras "YYYY-MM-DD" da sprint, ou null quando não cadastradas. */
  sprintInicio: string | null;
  sprintFim: string | null;
  /** PBI do cliente KMM (INTERNO) exibido junto das entregas do cliente selecionado. */
  interno: boolean;
};

export type EntregasCliente = {
  /** Até LIMITE_LANCAMENTOS PBIs, da versão mais nova para a mais antiga. */
  lancamentos: PbiEntrega[];
  /** Os LIMITE_FINALIZADAS PBIs finalizados mais recentes, em ordem CRESCENTE de Closed Date. */
  finalizadas: PbiEntrega[];
  /** Próximas entregas: PBIs do cliente + KMM (INTERNO) em sprint atual ou posterior, em ordem cronológica de sprint. */
  previsao: PbiPrevisaoCliente[];
  /** Preenchido quando a previsão não pôde ser montada por completo (ex.: datas das sprints indisponíveis). */
  avisoPrevisao?: string;
};

/**
 * Ordem da previsão: sprint mais próxima primeiro (fim da sprint; sem datas por último, pelo número da
 * sprint), dentro dela os PBIs do próprio cliente antes dos internos, depois pelo ID.
 */
export function ordenarPrevisao(itens: PbiPrevisaoCliente[]): PbiPrevisaoCliente[] {
  return [...itens].sort((a, b) => {
    if (a.sprintFim && b.sprintFim) {
      const d = a.sprintFim.localeCompare(b.sprintFim);
      if (d) return d;
    } else if (a.sprintFim || b.sprintFim) {
      return a.sprintFim ? -1 : 1;
    }
    return a.sprint.localeCompare(b.sprint, "pt-BR", { numeric: true }) || Number(a.interno) - Number(b.interno) || a.id - b.id;
  });
}

/**
 * Versão numérica de um texto livre do campo Versão. O campo vem sujo no Azure ("8.17",
 * "8.18 (Master) 8.16.0.2 (tag)", "8.17 - newkmm-ftl/feat/45769/...", "SEM PATCH", "Develop: 8.06"):
 * vale o primeiro número no formato N.N[.N...]; "Develop: ..." e textos sem número ("SEM VERSAO",
 * "SEM PATCH") não são lançamento e voltam como null.
 */
export function versaoDoCampo(bruto: string | null | undefined): string | null {
  const t = String(bruto ?? "").trim();
  if (!t || /^develop/i.test(t)) return null;
  return t.match(/\d+(?:\.\d+)+/)?.[0] ?? null;
}

/**
 * Versão prevista de um PBI = número da sua sprint ("Sprint 8.21" → "8.21"), pois no KMM5 as sprints
 * têm o número da versão que elas entregam. Sprint sem esse formato ("Sprint 23" do KMM4, "26.10.2026 -
 * 20.11.2026") não traz versão e devolve null — a tela mostra o nome da sprint no lugar.
 */
export function versaoPrevistaDaSprint(sprint: string | null | undefined): string | null {
  return /^\s*sprint\s+(\d+(?:\.\d+)+)\s*$/i.exec(String(sprint ?? ""))?.[1] ?? null;
}

/** "ID Externo - Título da demanda"; sem ID Externo, só o título. */
export function tituloComIdExterno(idExterno: string | null | undefined, titulo: string): string {
  const id = String(idExterno ?? "").trim();
  return id ? `${id} - ${titulo}` : titulo;
}

/** Compara duas versões numéricas ("8.17" < "8.18" < "8.18.1"); positivo quando a > b. */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** PBI concluído (State Finalizado, em qualquer caixa); Cancelado também tem Closed Date, mas não é entrega. */
export function estaFinalizado(state: string): boolean {
  return norm(state) === "finalizado";
}

export function estaCancelado(state: string): boolean {
  return norm(state).startsWith("cancel");
}

/** Aplica as regras da tela sobre os PBIs já lidos do Azure (ver getEntregasCliente). */
export function montarEntregas(pbis: PbiEntrega[], cliente: string): EntregasCliente {
  const lancamentos = pbis
    .filter((p) => p.versao && !estaCancelado(p.state))
    .sort(
      (a, b) =>
        compararVersoes(b.versao, a.versao) || (b.closedDate ?? "").localeCompare(a.closedDate ?? "") || b.id - a.id
    )
    .slice(0, LIMITE_LANCAMENTOS);

  // Os 5 mais recentes por Closed Date, exibidos do mais antigo ao mais novo (ordem crescente).
  const finalizadas = pbis
    .filter((p) => p.cliente === cliente && p.closedDate && estaFinalizado(p.state))
    .sort((a, b) => (b.closedDate ?? "").localeCompare(a.closedDate ?? "") || b.id - a.id)
    .slice(0, LIMITE_FINALIZADAS)
    .reverse();

  return { lancamentos, finalizadas, previsao: [] };
}

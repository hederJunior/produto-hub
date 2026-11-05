/**
 * Gestão de clientes > "Demandas entregues" (pedido por Heder em 2026-11-04): últimos lançamentos de
 * versão, últimas demandas finalizadas e previsão de próximas entregas do cliente. Só tipos e regras
 * PURAS (sem fetch) — usado pela tela e pela consulta ao Azure (lib/devops-client.ts).
 */

/** Cliente cujos PBIs com Versão entram em todo cliente (releases internas que o cliente também recebe). */
export const CLIENTE_INTERNO = "KMM (INTERNO)";

export const LIMITE_LANCAMENTOS = 10;
export const LIMITE_FINALIZADAS = 5;
export const LIMITE_PREVISAO = 5;

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

export type EntregasCliente = {
  /** Até LIMITE_LANCAMENTOS PBIs, da versão mais nova para a mais antiga. */
  lancamentos: PbiEntrega[];
  /** Os LIMITE_FINALIZADAS PBIs finalizados mais recentes, em ordem CRESCENTE de Closed Date. */
  finalizadas: PbiEntrega[];
};

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

  return { lancamentos, finalizadas };
}

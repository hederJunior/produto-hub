/**
 * Downstream > "Ag. Deploy" (pedido por Heder em 2026-11-08): PBIs com State = "Aguardando Deploy",
 * em lista agrupada por Squad (mesmo modelo do Refinamento Tech). Aging = dias desde a Resolved Date.
 * Só tipos e constantes (sem fetch) — usado pela tela e pela consulta ao Azure (lib/devops-client.ts).
 */

/** Aging (dias desde a Resolved Date) acima disto ganha o indicador vermelho. */
export const DIAS_ALERTA_AG_DEPLOY = 15;

export type ItemAgDeploy = {
  id: number;
  titulo: string;
  areaPath: string;
  /** TeamProject (KMM4/KMM5) — monta o link do PBI e a busca do último comentário. */
  projeto: string;
  cliente: string;
  po: string;
  classificacao: string;
  /** Microsoft.VSTS.Common.ResolvedDate (ISO) ou null — data base do aging. */
  resolvedDate: string | null;
  /** System.CommentCount — só PBIs com comentário têm o último comentário buscado. */
  qtdComentarios: number;
};

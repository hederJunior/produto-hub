/**
 * Seção Backlog (Roadmap e entregas, pedido por Heder em 2026-10-14). Regras da visão "Esteiras
 * Clientes": só Product Backlog Item, com State = "Backlog" e Etapa (Custom.Etapa) = "Backlog", das
 * 4 squads abaixo. Nomes de squad = último segmento do Area Path (como no Azure, sem acento onde o
 * Azure não tem: "Projetos de Implantacao").
 */
export const ESTEIRAS_CLIENTES_SQUADS = [
  "TMS - Dedicada Maroni",
  "TMS - Dedicada Transben",
  "TMS - Projetos de Implantacao",
  "TMS - Serviços da Carteira",
] as const;

/** Item abre há mais de N dias (Created Date → hoje) ganha o indicador vermelho no fim da linha. */
export const DIAS_ALERTA_BACKLOG = 30;

export type ItemBacklog = {
  id: number;
  titulo: string;
  areaPath: string;
  cliente: string;
  po: string;
  /** System.CreatedDate (ISO). */
  createdDate: string;
  /** Custom.DataAberturaProduto (data pura, ex. "2026-10-05T00:00:00Z") ou null. */
  dataAberturaProduto: string | null;
  classificacao: string;
  feature: string;
  /** Microsoft.VSTS.Common.Priority (1–4) ou null. */
  prioridade: number | null;
};

/** Último segmento do Area Path ("KMM5\TMS - Dedicada Maroni" → "TMS - Dedicada Maroni"). */
export function nomeDaSquad(areaPath: string): string {
  return areaPath.split("\\").pop() || areaPath;
}

/** Nome curto pra exibir ("TMS - Dedicada Maroni" → "Dedicada Maroni"). */
export function nomeCurtoDaSquad(areaPath: string): string {
  return nomeDaSquad(areaPath).replace(/^TMS\s*-\s*/, "");
}

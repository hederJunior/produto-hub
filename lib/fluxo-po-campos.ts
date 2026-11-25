/**
 * Fluxo do PO — nomes técnicos (reference names) do Azure DevOps, num único lugar.
 *
 * Confirmados em 2026-11-20 com `scripts/azure-campos.mjs` (somente leitura, projeto KMM5). Se um nome mudar no
 * Azure, ajuste SÓ aqui. Lembrete: reference name inexistente em `workitemsbatch` derruba o lote inteiro (TF51535).
 */

export const PROJETO_FLUXO_PO = "KMM5";
export const TIPO_PBI = "Product Backlog Item";
/** Nome real do tipo no Azure (com um "s" só). Filho do PBI pela relação Hierarchy-Forward. */
export const TIPO_ASSESMENT = "Assesment";
export const RELACAO_FILHO = "System.LinkTypes.Hierarchy-Forward";

export const CAMPOS_PBI = {
  titulo: "System.Title",
  status: "System.State",
  etapa: "Custom.Etapa",
  areaPath: "System.AreaPath",
  tags: "System.Tags",
  descricao: "System.Description",
  cliente: "Custom.Cliente",
  po: "Custom.PO",
  responsavel: "System.AssignedTo",
  classificacao: "Custom.67a95862-58a3-47f7-8f7c-285ec4d13106",
  dataAberturaProduto: "Custom.DataAberturaProduto",
  dataComite: "Custom.443622e0-6ab8-4ae5-9371-612b44a8fb1d",
  prioridade: "Microsoft.VSTS.Common.Priority",
  criadoEm: "System.CreatedDate",
  revisao: "System.Rev",
} as const;

/** Data Comitê no Assesment tem o MESMO reference name do PBI (confirmado). */
export const CAMPOS_ASSESMENT = {
  dataComite: CAMPOS_PBI.dataComite,
  status: "System.State",
} as const;

/** Valores da lista "Status" (System.State) do PBI no KMM5. */
export const STATUS = {
  backlog: "Backlog",
  orcamento: "Orçamento",
  /** Status do cancelamento de demanda (valor da lista de Status do Azure, conferido na T01). */
  cancelado: "Cancelado",
} as const;

/** Valores da lista Etapa (Custom.Etapa) usados pelo fluxo. Lista completa do Azure: ETAPAS_AZURE. */
export const ETAPA = {
  backlog: "Backlog",
  comite: "Comitê",
  analise: "Análise",
  relacionamentoComercial: "Relacionamento/Comercial",
} as const;

export const ETAPAS_AZURE = [
  "Aguardando Priorização", "Análise", "Backlog", "Cancelado", "Comitê", "Delivery",
  "Execução", "Finalizado", "Impedimento", "Negado", "Relacionamento/Comercial", "Validação Interna",
] as const;

/** Valores permitidos de Classificação (lista do Azure; quem inclui valor novo é pendência de negócio). */
export const CLASSIFICACOES_AZURE = [
  "Customização Produto", "Débito Técnico", "E-Commerce", "Ecossistema", "EDI", "Fast Track",
  "Integração Padrão", "Nota Técnica", "Prefeitura/Banco", "Reprocessamento", "Tarefa Tech", "Versionamento",
] as const;

/** Tag que marca a etapa 3.1 (Análise de engenharia). */
export const TAG_PRONTO_REFINAMENTO_TECH = "Pronto para refinamento tech";


/** Area Path raiz do KMM5: card nela = etapa 1.1 (esteira ainda não definida). Esteiras são áreas filhas. */
export const AREA_RAIZ_KMM5 = "KMM5";

/** Organização do Azure DevOps (a mesma usada nos links dos demais Kanbans). */
export const ORGANIZACAO_AZURE = "kmmbynstech";

/** Link do PBI no Azure DevOps (o número do card abre aqui). */
export function urlPbiAzure(id: number): string {
  return `https://dev.azure.com/${ORGANIZACAO_AZURE}/${PROJETO_FLUXO_PO}/_workitems/edit/${id}`;
}

/** Aging (hoje − Data Abertura Produto, fallback Created Date) fica vermelho acima disso. */
export const DIAS_ALERTA_AGING = 30;

/** Lista de campos que a leitura dos PBIs do fluxo pede ao Azure (todos confirmados acima). */
export const CAMPOS_LEITURA_PBI: string[] = [
  "System.Id",
  CAMPOS_PBI.titulo,
  CAMPOS_PBI.status,
  CAMPOS_PBI.etapa,
  CAMPOS_PBI.areaPath,
  CAMPOS_PBI.tags,
  CAMPOS_PBI.cliente,
  CAMPOS_PBI.po,
  CAMPOS_PBI.responsavel,
  CAMPOS_PBI.classificacao,
  CAMPOS_PBI.dataAberturaProduto,
  CAMPOS_PBI.dataComite,
  CAMPOS_PBI.prioridade,
  CAMPOS_PBI.criadoEm,
  CAMPOS_PBI.revisao,
];

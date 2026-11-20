/**
 * Fluxo do PO — leitura do detalhe de um PBI (T08): montagem PURA de anexos e histórico a partir do que o Azure devolve.
 * Sem fetch (a leitura está em lib/fluxo-po-detalhe-servidor.ts). Descrição e comentários passam por `lib/html-seguro.ts`.
 */
import { chaveDia } from "./fluxo-po";
import { CAMPOS_PBI } from "./fluxo-po-campos";

export type AnexoPbi = {
  nome: string;
  /** Bytes (null se o Azure não informou). */
  tamanho: number | null;
  /** Quem anexou (revisão em que o anexo apareceu); null se não for possível determinar. */
  autor: string | null;
  /** Quando foi anexado (ISO). */
  quando: string | null;
  /** Link do anexo no Azure DevOps (abre com a sessão do próprio usuário no Azure). */
  link: string;
};

export type MudancaHistorico = { campo: string; de: string | null; para: string | null };
export type EntradaHistorico = { rev: number; quando: string | null; usuario: string; mudancas: MudancaHistorico[] };

type RelacaoMudada = { rel?: string; url?: string; attributes?: { name?: string } };

/** Formato de uma revisão em `GET /workItems/{id}/updates` (só o que usamos). */
export type UpdateAzure = {
  rev?: number;
  revisedDate?: string;
  revisedBy?: { displayName?: string } | null;
  fields?: Record<string, { oldValue?: unknown; newValue?: unknown }>;
  relations?: { added?: RelacaoMudada[]; removed?: RelacaoMudada[] };
};

export type RelacaoAzure = { rel?: string; url?: string; attributes?: { name?: string; resourceSize?: number; resourceCreatedDate?: string } };

/** Campos que aparecem no histórico (os demais — Rev, datas de sistema, Watermark... — são ruído). */
export const ROTULOS_HISTORICO: Record<string, string> = {
  "System.Title": "Título",
  "System.State": "Status",
  [CAMPOS_PBI.etapa]: "Etapa",
  [CAMPOS_PBI.areaPath]: "Area Path",
  [CAMPOS_PBI.tags]: "Tags",
  [CAMPOS_PBI.cliente]: "Cliente",
  [CAMPOS_PBI.classificacao]: "Classificação",
  [CAMPOS_PBI.dataAberturaProduto]: "Data Abertura Produto",
  [CAMPOS_PBI.dataComite]: "Data Comitê",
  [CAMPOS_PBI.prioridade]: "Prioridade",
  [CAMPOS_PBI.po]: "PO",
  "System.AssignedTo": "Responsável",
  "System.IterationPath": "Sprint (Iteration)",
};

const CAMPOS_DE_DATA = new Set<string>([CAMPOS_PBI.dataComite, CAMPOS_PBI.dataAberturaProduto]);

function valorLegivel(campo: string, valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "object") {
    const nome = (valor as { displayName?: unknown }).displayName;
    return typeof nome === "string" && nome ? nome : null;
  }
  const texto = String(valor);
  return CAMPOS_DE_DATA.has(campo) ? (chaveDia(texto) ?? texto) : texto;
}

function idDoAnexo(url: string | undefined): string {
  return /\/attachments\/([0-9a-f-]+)/i.exec(String(url ?? ""))?.[1]?.toLowerCase() ?? String(url ?? "");
}

/**
 * Histórico legível do PBI: uma entrada por revisão, só com os campos de ROTULOS_HISTORICO que mudaram (+ anexos
 * adicionados/removidos), da mais recente para a mais antiga. Revisões sem nenhuma mudança relevante são omitidas.
 */
export function montarHistorico(updates: UpdateAzure[]): EntradaHistorico[] {
  const entradas: EntradaHistorico[] = [];
  for (const u of updates) {
    const mudancas: MudancaHistorico[] = [];
    for (const [campo, mudanca] of Object.entries(u.fields ?? {})) {
      const rotulo = ROTULOS_HISTORICO[campo];
      if (!rotulo) continue;
      const de = valorLegivel(campo, mudanca.oldValue);
      const para = valorLegivel(campo, mudanca.newValue);
      if (de !== para) mudancas.push({ campo: rotulo, de, para });
    }
    for (const r of u.relations?.added ?? []) if (r.rel === "AttachedFile") mudancas.push({ campo: "Anexo", de: null, para: r.attributes?.name ?? "(sem nome)" });
    for (const r of u.relations?.removed ?? []) if (r.rel === "AttachedFile") mudancas.push({ campo: "Anexo", de: r.attributes?.name ?? "(sem nome)", para: null });
    if (!mudancas.length) continue;
    entradas.push({ rev: u.rev ?? 0, quando: u.revisedDate ?? null, usuario: u.revisedBy?.displayName ?? "(desconhecido)", mudancas });
  }
  return entradas.sort((a, b) => b.rev - a.rev);
}

/** Anexos (relações `AttachedFile`) com autor e data tirados da revisão em que cada um foi adicionado. */
export function montarAnexos(relacoes: RelacaoAzure[] | null | undefined, updates: UpdateAzure[] = []): AnexoPbi[] {
  const origem = new Map<string, { autor: string | null; quando: string | null }>();
  for (const u of [...updates].sort((a, b) => (a.rev ?? 0) - (b.rev ?? 0))) {
    for (const r of u.relations?.added ?? []) {
      if (r.rel !== "AttachedFile") continue;
      const chave = idDoAnexo(r.url);
      if (!origem.has(chave)) origem.set(chave, { autor: u.revisedBy?.displayName ?? null, quando: u.revisedDate ?? null });
    }
  }
  return (relacoes ?? [])
    .filter((r) => r.rel === "AttachedFile" && r.url)
    .map((r) => {
      const o = origem.get(idDoAnexo(r.url));
      return {
        nome: r.attributes?.name ?? "(sem nome)",
        tamanho: typeof r.attributes?.resourceSize === "number" ? r.attributes.resourceSize : null,
        autor: o?.autor ?? null,
        quando: o?.quando ?? r.attributes?.resourceCreatedDate ?? null,
        link: r.url as string,
      };
    });
}

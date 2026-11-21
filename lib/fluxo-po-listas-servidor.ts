/**
 * Fluxo do PO — listas de valores do Azure DevOps para os editores da tela de detalhe (T16): Classificação, Cliente (ambos
 * listas fechadas no Azure; Cliente tem ~270 valores) e as esteiras (áreas filhas do KMM5). Leitura apenas, com cache curto
 * em memória (as listas quase não mudam e a tela as pede a cada detalhe aberto).
 */
import { API_VERSION, authHeader, getConfig } from "./devops-client";
import { CAMPOS_PBI, CLASSIFICACOES_AZURE, PROJETO_FLUXO_PO, TIPO_PBI } from "./fluxo-po-campos";

export type ListasFluxoPo = {
  classificacoes: string[];
  clientes: string[];
  esteiras: { valor: string; rotulo: string }[];
  /** Preenchido quando alguma lista não pôde ser lida do Azure (a tela avisa e cai para o que houver). */
  aviso: string | null;
};

const VALIDADE_MS = 5 * 60 * 1000;
let cache: { em: number; listas: ListasFluxoPo } | null = null;

async function get<T>(url: string): Promise<T> {
  const { pat } = getConfig();
  const res = await fetch(url, { headers: authHeader(pat), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function valoresPermitidos(referencia: string): Promise<string[]> {
  const { org } = getConfig();
  const j = await get<{ allowedValues?: unknown[] }>(
    `https://dev.azure.com/${org}/${encodeURIComponent(PROJETO_FLUXO_PO)}/_apis/wit/workitemtypes/${encodeURIComponent(TIPO_PBI)}/fields/${encodeURIComponent(referencia)}?$expand=allowedValues&api-version=${API_VERSION}`,
  );
  return (j.allowedValues ?? []).filter((v): v is string => typeof v === "string").sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function lerListasDeValores(): Promise<ListasFluxoPo> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return cache.listas;
  const { org } = getConfig();
  const falhas: string[] = [];
  const [classificacoes, clientes, esteiras] = await Promise.all([
    valoresPermitidos(CAMPOS_PBI.classificacao).catch(() => {
      falhas.push("Classificação");
      return [...CLASSIFICACOES_AZURE] as string[];
    }),
    valoresPermitidos(CAMPOS_PBI.cliente).catch(() => {
      falhas.push("Cliente");
      return [] as string[];
    }),
    get<{ children?: { name: string }[] }>(`https://dev.azure.com/${org}/${encodeURIComponent(PROJETO_FLUXO_PO)}/_apis/wit/classificationnodes/areas?$depth=2&api-version=${API_VERSION}`)
      .then((raiz) =>
        (raiz.children ?? [])
          .map((f) => ({ valor: `${PROJETO_FLUXO_PO}\\${f.name}`, rotulo: f.name }))
          .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")),
      )
      .catch(() => {
        falhas.push("Esteiras");
        return [] as { valor: string; rotulo: string }[];
      }),
  ]);
  const listas: ListasFluxoPo = { classificacoes, clientes, esteiras, aviso: falhas.length ? `Não foi possível ler do Azure DevOps a lista de: ${falhas.join(", ")}.` : null };
  if (!falhas.length) cache = { em: Date.now(), listas }; // só guarda no cache quando completa
  return listas;
}

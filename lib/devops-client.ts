/**
 * Cliente para a Azure DevOps REST API.
 * Requer AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no ambiente. KMM4 e KMM5 são projetos separados
 * dentro dessa organização (ver lib/devops-projetos.ts) — por isso o projeto é sempre um parâmetro
 * explícito aqui, nunca uma variável de ambiente única.
 * O PAT precisa do escopo "Work Items → Read" (mesmo requisito já identificado no roadmap-panel).
 */

const API_VERSION = "7.1";

function getConfig() {
  const org = process.env.AZURE_DEVOPS_ORG;
  const pat = process.env.AZURE_DEVOPS_PAT;

  if (!org || !pat) {
    throw new Error("Azure DevOps não configurado: defina AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT.");
  }
  return { org, pat };
}

/**
 * Monta a cláusula `([System.AreaPath] UNDER 'A' OR [System.AreaPath] UNDER 'B' ...)` para múltiplas áreas.
 * IMPORTANTE (achado em 2026-09-19): uma WIQL sem filtro de Area Path/TeamProject, mesmo escopada
 * por projeto na URL, pode retornar item de OUTRO projeto neste org — por isso toda query aqui
 * também inclui `[System.TeamProject] = '<project>'` explicitamente, nunca confia só na URL.
 */
function clausulaAreaPaths(areaPaths: string[]): string {
  return "(" + areaPaths.map((ap) => `[System.AreaPath] UNDER '${ap}'`).join(" OR ") + ")";
}

/**
 * Mesma cláusula de clausulaAreaPaths(), mas também inclui itens sentados EXATAMENTE na raiz do
 * projeto (sem nenhum team/Area Path atribuído) — pedido por Heder em 2026-09-20 depois de achar
 * um PBI (#41329, "Melhoria no aplicativo do checklist [ERS-PLATINUM]") com
 * `System.AreaPath = 'KMM4'` (a raiz, sem subpath), que o UNDER dos times configurados nunca
 * pega. Usada só na captura dos indicadores (fetchPbisParaSnapshot) — as outras consultas
 * (getBacklogAtivo, getRoadmapItems) continuam restritas aos times configurados, comportamento
 * que ninguém pediu pra mudar. Itens pegos por essa cláusula extra aparecem com
 * squad = '<project>' (ex.: "KMM4") em DemandaAtual/DemandaMensal — o que já basta pra virar uma
 * opção normal no dropdown de Squad (ele lista os valores distintos capturados), sem precisar de
 * nenhum tratamento especial no filtro.
 */
function clausulaAreaPathsComRaiz(project: string, areaPaths: string[]): string {
  const clausulas = areaPaths.map((ap) => `[System.AreaPath] UNDER '${ap}'`);
  clausulas.push(`[System.AreaPath] = '${project}'`);
  return "(" + clausulas.join(" OR ") + ")";
}

function authHeader(pat: string) {
  const token = Buffer.from(`:${pat}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

export type WorkItem = {
  id: number;
  fields: Record<string, unknown>;
};

/**
 * Executa uma WIQL (Work Item Query Language) e retorna os work items completos.
 * `produtoAreaPath` filtra por área/board do KMM4 ou KMM5 conforme configurado no projeto DevOps.
 */
export async function queryWorkItems(wiql: string, project: string): Promise<WorkItem[]> {
  const { org, pat } = getConfig();
  const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis`;

  const wiqlRes = await fetch(`${base}/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader(pat),
    },
    body: JSON.stringify({ query: wiql }),
  });

  if (!wiqlRes.ok) {
    throw new Error(`Falha na consulta WIQL (${wiqlRes.status}): ${await wiqlRes.text()}`);
  }

  const { workItems } = (await wiqlRes.json()) as { workItems: { id: number }[] };
  if (!workItems?.length) return [];

  const ids = workItems.map((w) => w.id).join(",");
  const itemsRes = await fetch(`${base}/wit/workitems?ids=${ids}&api-version=${API_VERSION}`, {
    headers: authHeader(pat),
  });

  if (!itemsRes.ok) {
    throw new Error(`Falha ao buscar work items (${itemsRes.status}): ${await itemsRes.text()}`);
  }

  const { value } = (await itemsRes.json()) as { value: WorkItem[] };
  return value;
}

/** Atalho: busca itens de backlog ativos de um produto (um ou mais Area Paths/times). */
export async function getBacklogAtivo(project: string, areaPaths: string[]): Promise<WorkItem[]> {
  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = '${project}'
      AND ${clausulaAreaPaths(areaPaths)}
      AND [System.State] NOT IN ('Closed', 'Removed')
    ORDER BY [System.ChangedDate] DESC
  `;
  return queryWorkItems(wiql, project);
}

export type RoadmapItem = {
  id: number;
  titulo: string;
  produto: string;
  responsavel?: string;
  trimestre: string;
  progresso: number; // 0-100, estimado pela proporção de itens-filho concluídos
  statusPrazo: "No prazo" | "Atenção" | "Atrasado";
};

function trimestreDe(dataIso?: string): string {
  if (!dataIso) return "Sem previsão";
  const d = new Date(dataIso);
  const trimestre = Math.floor(d.getMonth() / 3) + 1;
  return `Q${trimestre} ${d.getFullYear()}`;
}

const CAMPOS_SNAPSHOT = [
  "System.Title",
  "System.State",
  "System.AreaPath",
  "System.CreatedDate",
  "Custom.Cliente",
  "Custom.DataAberturaProduto",
  "Microsoft.VSTS.Common.ClosedDate",
  "Custom.Etapa",
  // "Custom.Classificacao" REMOVIDO em 2026-09-20: confirmado por erro real do Azure DevOps
  // (TF51535 Cannot find field Custom.Classificacao) que esse reference name não existe — era
  // uma suposição baseada no padrão de nomenclatura dos outros campos custom deste org, nunca
  // confirmada. O lote inteiro falhava (400) por causa de UM campo inexistente na lista, o que
  // parou o JOB de captura por completo. Rodar scripts/inspect-devops-fields.mjs pra achar o
  // reference name real do campo "Classificação" antes de reincluir.
];

export type ResultadoFetchSnapshot = { items: WorkItem[]; possivelTruncamento: boolean };

/**
 * Busca TODOS os "Product Backlog Item" de um produto, sem filtro de estado — usado pelo JOB de
 * captura (DemandaSnapshot), que precisa do histórico completo (os painéis decidem o que contar
 * como aberta/encerrada/cancelada a partir do System.State, não a captura). Também inclui itens
 * sem team/Area Path atribuído (sentados na raiz do projeto — ver clausulaAreaPathsComRaiz()),
 * pedido por Heder em 2026-09-20.
 * Usa o endpoint em lote (workitemsbatch, POST) em blocos de 200 ids, porque a lista de PBIs de
 * um produto passa de 200 (limite por chamada da Azure DevOps REST API) — diferente de
 * queryWorkItems() acima, que busca tudo em uma única chamada GET e por isso só é seguro para
 * conjuntos pequenos (ex.: backlog ativo filtrado por Area Path).
 * A WIQL da organização tem limite padrão de 20000 resultados; se o total de ids bater nisso,
 * `possivelTruncamento` volta true para o chamador registrar um aviso.
 */
export async function fetchPbisParaSnapshot(project: string, areaPaths: string[]): Promise<ResultadoFetchSnapshot> {
  const { org, pat } = getConfig();
  const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis`;

  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = '${project}'
      AND ${clausulaAreaPathsComRaiz(project, areaPaths)}
      AND [System.WorkItemType] = 'Product Backlog Item'
    ORDER BY [System.Id]
  `;

  const wiqlRes = await fetch(`${base}/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(pat) },
    body: JSON.stringify({ query: wiql }),
  });
  if (!wiqlRes.ok) {
    throw new Error(`Falha na consulta WIQL de snapshot (${wiqlRes.status}): ${await wiqlRes.text()}`);
  }

  const { workItems } = (await wiqlRes.json()) as { workItems: { id: number }[] };
  const ids = workItems.map((w) => w.id);
  const possivelTruncamento = ids.length >= 19999;
  if (!ids.length) return { items: [], possivelTruncamento };

  const lotes: number[][] = [];
  for (let i = 0; i < ids.length; i += 200) lotes.push(ids.slice(i, i + 200));

  const items: WorkItem[] = [];
  for (const lote of lotes) {
    const res = await fetch(`${base}/wit/workitemsbatch?api-version=${API_VERSION}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(pat) },
      body: JSON.stringify({ ids: lote, fields: CAMPOS_SNAPSHOT }),
    });
    if (!res.ok) {
      throw new Error(`Falha ao buscar lote de work items para snapshot (${res.status}): ${await res.text()}`);
    }
    const { value } = (await res.json()) as { value: WorkItem[] };
    items.push(...value);
  }

  return { items, possivelTruncamento };
}

/**
 * Progresso de um Epic/Feature = % de itens-filho (tasks/PBIs ligados via hierarquia) já concluídos.
 * TODO(Heder): se o time usa Story Points/Effort, trocar essa razão simples por soma de esforço
 * concluído / esforço total, que costuma refletir melhor o progresso real.
 */
async function progressoDoItem(id: number, org: string, project: string, pat: string): Promise<number> {
  const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis`;
  const wiqlRes = await fetch(`${base}/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(pat) },
    body: JSON.stringify({
      query: `SELECT [System.Id] FROM WorkItemLinks WHERE ([Source].[System.Id] = ${id}) AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward') MODE (Recursive)`,
    }),
  });
  if (!wiqlRes.ok) return 0;

  const { workItemRelations } = (await wiqlRes.json()) as { workItemRelations?: { target?: { id: number } }[] };
  const filhoIds = (workItemRelations ?? []).map((r) => r.target?.id).filter((v): v is number => Boolean(v));
  if (!filhoIds.length) return 0;

  const itensRes = await fetch(
    `${base}/wit/workitems?ids=${filhoIds.join(",")}&fields=System.State&api-version=${API_VERSION}`,
    { headers: authHeader(pat) }
  );
  if (!itensRes.ok) return 0;

  const { value } = (await itensRes.json()) as { value: WorkItem[] };
  const total = value.length;
  const concluidos = value.filter((w) => ["Closed", "Done", "Resolved"].includes(String(w.fields["System.State"]))).length;
  return total ? Math.round((concluidos / total) * 100) : 0;
}

/**
 * Roadmap de entregas: Epics/Features do produto, agrupáveis por trimestre (a partir de
 * Microsoft.VSTS.Scheduling.TargetDate) com progresso estimado. Usado pela tela "Roadmap e entregas".
 */
export async function getRoadmapItems(
  project: string,
  areaPaths: string[],
  produto: string
): Promise<RoadmapItem[]> {
  const { org, pat } = getConfig();
  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = '${project}'
      AND ${clausulaAreaPaths(areaPaths)}
      AND [System.WorkItemType] IN ('Epic', 'Feature')
      AND [System.State] NOT IN ('Removed')
    ORDER BY [Microsoft.VSTS.Scheduling.TargetDate] ASC
  `;
  const items = await queryWorkItems(wiql, project);

  return Promise.all(
    items.map(async (item): Promise<RoadmapItem> => {
      const progresso = await progressoDoItem(item.id, org, project, pat);
      const dataAlvo = item.fields["Microsoft.VSTS.Scheduling.TargetDate"] as string | undefined;

      let statusPrazo: RoadmapItem["statusPrazo"] = "No prazo";
      if (dataAlvo) {
        const alvo = new Date(dataAlvo);
        const diasRestantes = (alvo.getTime() - Date.now()) / 86_400_000;
        if (diasRestantes < 0 && progresso < 100) statusPrazo = "Atrasado";
        else if (diasRestantes < 15 && progresso < 80) statusPrazo = "Atenção";
      }

      return {
        id: item.id,
        titulo: String(item.fields["System.Title"] ?? `Item ${item.id}`),
        produto,
        responsavel: (item.fields["System.AssignedTo"] as any)?.displayName,
        trimestre: trimestreDe(dataAlvo),
        progresso,
        statusPrazo,
      };
    })
  );
}

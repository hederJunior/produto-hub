/**
 * Cliente para a Azure DevOps REST API.
 * Requer AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no ambiente. KMM4 e KMM5 são projetos separados
 * dentro dessa organização (ver lib/devops-projetos.ts) — por isso o projeto é sempre um parâmetro
 * explícito aqui, nunca uma variável de ambiente única.
 * O PAT precisa do escopo "Work Items → Read" (mesmo requisito já identificado no roadmap-panel).
 */

import { estadoIndicaConcluido } from "./kmm-theme";

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
    // errorPolicy:"Omit" (achado por Heder em 2026-09-30, ver comentário igual em
    // getTasksAlocadas): sem isso, 1 id excluído/inacessível no meio do lote (ex.: item apagado
    // no Azure DevOps entre o WIQL e esta chamada) derruba o LOTE INTEIRO com 404
    // "TF401232: Work item X does not exist" — "Omit" faz a API só pular esse id, sem falhar tudo.
    const res = await fetch(`${base}/wit/workitemsbatch?api-version=${API_VERSION}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(pat) },
      body: JSON.stringify({ ids: lote, fields: CAMPOS_SNAPSHOT, errorPolicy: "Omit" }),
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

// ===== Roadmap por Epic/Feature (painel "Roadmap e Entregas", pedido por Heder em 2026-09-22) =====

const CAMPOS_ROADMAP_EPIC = [
  "System.Title",
  "System.WorkItemType",
  "System.State",
  "System.AreaPath",
  "System.Description",
  "Custom.Produto",
  "Microsoft.VSTS.Scheduling.StartDate",
  "Microsoft.VSTS.Scheduling.TargetDate",
];

/**
 * Nome de referência do campo custom "Item de Road Map Estratégico" (picklist de string, valores
 * "Sim"/"Não") no processo do Azure DevOps. É um campo picklist, por isso o nome de referência é
 * um GUID em vez de um nome legível (confirmado por Heder em 2026-09-28, direto na tela de
 * Project Settings > Process > Epic > Fields — não dá pra adivinhar esse formato).
 */
const CAMPO_ITEM_ROADMAP_ESTRATEGICO = "Custom.44b378c0-6c3f-4478-8693-c16e44f9928b";

/**
 * Lista os IDs de todos os Epics que batem com as regras do painel "Roadmap e Entregas": Work
 * Item Type = Epic, excluindo Removed, com o campo "Item de Road Map Estratégico" marcado como
 * "Sim".
 *
 * Regra trocada em 2026-09-28 (pedido do Heder): a v1 filtrava por `Custom.Produto` (produto de
 * negócio do Epic). Heder pediu pra substituir isso por uma regra única — só o campo booleano de
 * negócio "Item de Road Map Estratégico" decide se o Epic entra na visão, independente de produto.
 *
 * `projetos` deve cobrir todos os TeamProjects onde um Epic marcado pode morar (o chamador passa
 * KMM4 e/ou KMM5 — ver lib/devops-projetos.ts). Usa o `queryWorkItems()` já testado em produção
 * (project-scoped) uma vez por projeto, em paralelo.
 */
export async function getEpicIds(projetos: string[]): Promise<number[]> {
  const idsPorProjeto = await Promise.all(
    projetos.map(async (project) => {
      const wiql = `
        SELECT [System.Id]
        FROM WorkItems
        WHERE [System.TeamProject] = '${project}'
          AND [System.WorkItemType] = 'Epic'
          AND [System.State] NOT IN ('Removed')
          AND [${CAMPO_ITEM_ROADMAP_ESTRATEGICO}] = 'Sim'
        ORDER BY [System.Id]
      `;
      const items = await queryWorkItems(wiql, project);
      return items.map((w) => w.id);
    })
  );

  return Array.from(new Set(idsPorProjeto.flat()));
}

export type FeatureRoadmap = {
  id: number;
  titulo: string;
  state: string;
  startDate: string | null;
  targetDate: string | null;
};

export type EpicRoadmap = {
  id: number;
  titulo: string;
  areaPath: string;
  descricao: string;
  produto: string;
  state: string;
  startDate: string | null;
  targetDate: string | null;
  responsavel: { nome: string; avatarUrl: string | null } | null;
  features: FeatureRoadmap[];
};

/** Remove tags HTML do campo System.Description (vem como HTML do editor rich-text do Azure DevOps). */
function textoSemHtml(html: unknown): string {
  const s = typeof html === "string" ? html : "";
  return s
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Busca um EPIC específico (por ID) + as Features filhas diretas dele (relação
 * `System.LinkTypes.Hierarchy-Forward` — filtra WorkItemType = 'Feature' entre os filhos, já que
 * um Epic pode ter outros tipos de link, ex.: "Related"), pro painel "Roadmap e Entregas".
 *
 * V1 (2026-09-22): recebe o ID do Epic explicitamente (usado com o #15057, "Integração SuperApp
 * <=> KMM4 (Onda 3)", como exemplo único pra validar o layout com o Heder). A versão genérica —
 * WIQL por `[Custom.Produto] = 'KMM4'` + `[System.WorkItemType] = 'Epic'` pra listar TODOS os
 * Epics do produto — fica pro próximo passo, depois do layout aprovado.
 *
 * Work item IDs são únicos pra organização inteira (não por projeto Azure DevOps), então dá pra
 * buscar direto pelo endpoint de organização (sem `/{project}/` na URL), sem precisar saber antes
 * se o Epic mora no projeto KMM4 ou KMM5.
 */
export async function getEpicComFeatures(epicId: number): Promise<EpicRoadmap | null> {
  const { org, pat } = getConfig();
  const base = `https://dev.azure.com/${org}/_apis`;

  const epicRes = await fetch(`${base}/wit/workitems/${epicId}?$expand=relations&api-version=${API_VERSION}`, {
    headers: authHeader(pat),
  });
  if (epicRes.status === 404) return null;
  if (!epicRes.ok) {
    throw new Error(`Falha ao buscar Epic #${epicId} (${epicRes.status}): ${await epicRes.text()}`);
  }
  const epic = (await epicRes.json()) as WorkItem & { relations?: { rel: string; url: string }[] };

  const idsFilhos = (epic.relations ?? [])
    .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
    .map((r) => Number(r.url.split("/").pop()))
    .filter((n) => Number.isFinite(n));

  let features: FeatureRoadmap[] = [];
  if (idsFilhos.length) {
    const filhosRes = await fetch(
      `${base}/wit/workitems?ids=${idsFilhos.join(",")}&fields=${encodeURIComponent(CAMPOS_ROADMAP_EPIC.join(","))}&api-version=${API_VERSION}`,
      { headers: authHeader(pat) }
    );
    if (!filhosRes.ok) {
      throw new Error(`Falha ao buscar filhos do Epic #${epicId} (${filhosRes.status}): ${await filhosRes.text()}`);
    }
    const { value } = (await filhosRes.json()) as { value: WorkItem[] };
    features = value
      .filter((w) => w.fields["System.WorkItemType"] === "Feature")
      .map((w) => ({
        id: w.id,
        titulo: String(w.fields["System.Title"] ?? `Item ${w.id}`),
        state: String(w.fields["System.State"] ?? ""),
        startDate: (w.fields["Microsoft.VSTS.Scheduling.StartDate"] as string) ?? null,
        targetDate: (w.fields["Microsoft.VSTS.Scheduling.TargetDate"] as string) ?? null,
      }))
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  }

  const responsavelEpic = epic.fields["System.AssignedTo"] as
    | { displayName?: string; imageUrl?: string }
    | undefined;

  return {
    id: epic.id,
    titulo: String(epic.fields["System.Title"] ?? `Item ${epic.id}`),
    areaPath: String(epic.fields["System.AreaPath"] ?? ""),
    descricao: textoSemHtml(epic.fields["System.Description"]),
    produto: String(epic.fields["Custom.Produto"] ?? ""),
    state: String(epic.fields["System.State"] ?? ""),
    startDate: (epic.fields["Microsoft.VSTS.Scheduling.StartDate"] as string) ?? null,
    targetDate: (epic.fields["Microsoft.VSTS.Scheduling.TargetDate"] as string) ?? null,
    responsavel: responsavelEpic?.displayName
      ? { nome: responsavelEpic.displayName, avatarUrl: responsavelEpic.imageUrl ?? null }
      : null,
    features,
  };
}

// ===== Sprints alocadas (seção "Sprints alocadas" do painel "Roadmap e Entregas", pedido por
// Heder em 2026-09-23; generalizada de Task-only/1-item pra Task+Bug/WIQL em 2026-09-23) =====

const CAMPOS_SPRINT_TASK = [
  "System.Title",
  "System.WorkItemType",
  "System.State",
  "System.TeamProject",
  "System.AreaPath",
  "System.AssignedTo",
  "Microsoft.VSTS.Common.Priority",
  "Microsoft.VSTS.Scheduling.Effort",
  "Microsoft.VSTS.Scheduling.CompletedWork",
  "System.IterationPath",
  "System.IterationLevel3",
];

type CampoPessoa = { displayName?: string; imageUrl?: string } | undefined;

export type TaskAlocada = {
  id: number;
  titulo: string;
  tipo: string; // "Task" ou "Bug" (System.WorkItemType)
  produto: string;
  areaPath: string;
  state: string;
  prioridade: number | null;
  spEstimados: number | null;
  spReal: number | null;
  sprint: string;
  responsavel: { nome: string; avatarUrl: string | null } | null;
};

export type SprintMinima = { major: number; minor: number };

/** Extrai (major, minor) de um rótulo tipo "Sprint 8.16" (IterationLevel3). Sem match → null. */
function parseSprint(label: string): SprintMinima | null {
  const m = /(\d+)\.(\d+)/.exec(label);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/** `sprint` é igual ou posterior a `minima`? Compara major primeiro, depois minor. */
function sprintEhIgualOuPosterior(sprint: SprintMinima, minima: SprintMinima): boolean {
  if (sprint.major !== minima.major) return sprint.major > minima.major;
  return sprint.minor >= minima.minor;
}

/**
 * Busca Tasks e Bugs alocados em sprint, de um projeto específico, a partir de uma sprint mínima
 * (inclusive) em diante — pra seção "Sprints alocadas" do painel "Roadmap e Entregas".
 *
 * Generalizada em 2026-09-23 (pedido do Heder depois de validar o layout da v1, que trazia só a
 * Task #31537): agora é uma WIQL de verdade, trazendo TODOS os Task/Bug do projeto, não mais uma
 * lista fixa de IDs.
 *
 * Duas decisões que continuam valendo da v1 (tomadas depois do diagnóstico contra a Task #31537):
 * - Task/Bug não tem Story Points — "SP Estimados"/"SP Real" usam
 *   Microsoft.VSTS.Scheduling.Effort / Microsoft.VSTS.Scheduling.CompletedWork.
 * - `produto` vem de System.TeamProject, não de Custom.Produto (que não vem preenchido em Task/Bug).
 *
 * A comparação de sprint é numérica (major.minor extraído de "Sprint 8.16"), não textual — sprint
 * textual tipo string sort erraria (ex.: "8.2" > "8.16" na ordem alfabética, mas 8.2 é ANTERIOR).
 * Item cujo IterationLevel3 não bate no formato "N.M" é tratado como fora do filtro (excluído).
 *
 * A WIQL restringe `[System.IterationPath] UNDER '<project>\2026'` — assunção pra não puxar o
 * histórico inteiro do projeto numa consulta só (Task/Bug de anos anteriores não interessam pra
 * "sprint 8.16 em diante"); ajustar/generalizar se algum dia precisar enxergar sprint de outro ano.
 */
export async function getTasksAlocadas(project: string, sprintMinima: SprintMinima): Promise<TaskAlocada[]> {
  const { org, pat } = getConfig();
  const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis`;

  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = '${project}'
      AND [System.WorkItemType] IN ('Task', 'Bug')
      AND [System.State] NOT IN ('Removed')
      AND [System.IterationPath] UNDER '${project}\\2026'
    ORDER BY [System.IterationPath] ASC
  `;

  const wiqlRes = await fetch(`${base}/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(pat) },
    body: JSON.stringify({ query: wiql }),
  });
  if (!wiqlRes.ok) {
    throw new Error(`Falha na consulta WIQL de Tasks/Bugs alocados (${wiqlRes.status}): ${await wiqlRes.text()}`);
  }
  const { workItems } = (await wiqlRes.json()) as { workItems: { id: number }[] };
  const ids = workItems.map((w) => w.id);
  if (!ids.length) return [];

  const lotes: number[][] = [];
  for (let i = 0; i < ids.length; i += 200) lotes.push(ids.slice(i, i + 200));

  // Lotes em paralelo (não mais sequenciais) — melhora o tempo total de ~N×latência pra
  // ~1×latência, útil pro KMM5 sozinho já passar de 1300 Task/Bug (7 lotes).
  //
  // errorPolicy:"Omit" — causa raiz REAL do erro "Não foi possível carregar as sprints"
  // reportado por Heder em 2026-09-30 (a paralelização acima, feita antes de achar esta causa,
  // ajuda mas não resolve sozinha): a WIQL lista ids num instante e o workitemsbatch busca os
  // detalhes num instante seguinte — se QUALQUER item foi excluído (ou ficou sem permissão) nesse
  // intervalo, a API do Azure DevOps derruba o LOTE INTEIRO com 404 "TF401232: Work item X does
  // not exist, or you do not have permissions to read it." (confirmado com o item #27814).
  // "errorPolicy: Omit" faz a API só pular o id problemático em vez de falhar o lote inteiro —
  // mesmo comportamento intermitente explicaria por que nunca reproduzia testando manualmente
  // (só falha se um item específico tiver sido excluído bem naquela janela de tempo).
  const todos = (
    await Promise.all(
      lotes.map(async (lote) => {
        const res = await fetch(`${base}/wit/workitemsbatch?api-version=${API_VERSION}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader(pat) },
          body: JSON.stringify({ ids: lote, fields: CAMPOS_SPRINT_TASK, errorPolicy: "Omit" }),
        });
        if (!res.ok) {
          throw new Error(`Falha ao buscar lote de Tasks/Bugs alocados (${res.status}): ${await res.text()}`);
        }
        const { value } = (await res.json()) as { value: WorkItem[] };
        return value;
      })
    )
  ).flat();

  return todos
    .map((w) => {
      const assignedTo = w.fields["System.AssignedTo"] as CampoPessoa;
      const prioridade = w.fields["Microsoft.VSTS.Common.Priority"];
      const spEstimados = w.fields["Microsoft.VSTS.Scheduling.Effort"];
      const spReal = w.fields["Microsoft.VSTS.Scheduling.CompletedWork"];
      return {
        id: w.id,
        titulo: String(w.fields["System.Title"] ?? `Item ${w.id}`),
        tipo: String(w.fields["System.WorkItemType"] ?? ""),
        produto: String(w.fields["System.TeamProject"] ?? ""),
        areaPath: String(w.fields["System.AreaPath"] ?? ""),
        state: String(w.fields["System.State"] ?? ""),
        prioridade: typeof prioridade === "number" ? prioridade : null,
        spEstimados: typeof spEstimados === "number" ? spEstimados : null,
        spReal: typeof spReal === "number" ? spReal : null,
        sprint: String(w.fields["System.IterationLevel3"] ?? w.fields["System.IterationPath"] ?? "Sem sprint"),
        responsavel: assignedTo?.displayName
          ? { nome: assignedTo.displayName, avatarUrl: assignedTo.imageUrl ?? null }
          : null,
      };
    })
    .filter((t) => {
      const parsed = parseSprint(t.sprint);
      return parsed !== null && sprintEhIgualOuPosterior(parsed, sprintMinima);
    });
}

// ===== Demandas de Comitê (aba "Comitês" do painel "Roadmap e Entregas", pedido por Heder em
// 2026-09-28, a partir de um dashboard Power BI existente "Demandas Programadas") =====

/**
 * Nome de referência do campo custom "Data Comitê" (tipo Date) — GUID em vez de nome legível,
 * confirmado por Heder direto no Azure DevOps (mesmo motivo do campo "Item de Road Map
 * Estratégico" documentado em getEpicIds: alguns campos custom saem com nome de referência em
 * GUID, não dá pra adivinhar esse formato).
 */
const CAMPO_DATA_COMITE = "Custom.443622e0-6ab8-4ae5-9371-612b44a8fb1d";

export type DemandaComite = {
  id: number;
  titulo: string;
  produto: string;
  areaPath: string;
  cliente: string;
  po: string;
  state: string;
  dataComite: string | null;
};

const CAMPOS_DEMANDA_COMITE = [
  "System.Title",
  "System.State",
  "System.TeamProject",
  "System.AreaPath",
  "Custom.Cliente",
  "Custom.PO",
  CAMPO_DATA_COMITE,
];

/**
 * Lista os PBIs ("Demanda", mesma convenção do resto do app — ver fetchPbisParaSnapshot) que já
 * têm uma Data de Comitê marcada, pra aba "Comitês" do painel "Roadmap e Entregas".
 *
 * Regras confirmadas com o Heder em 2026-09-28 (a frase "com base no campo X" tinha duas leituras
 * possíveis — perguntei antes de escrever a query):
 * - Só entra o PBI que JÁ TEM esse campo de data preenchido — `[CAMPO_DATA_COMITE] <> ''` na
 *   WIQL é filtro de inclusão mesmo, não é "todo PBI em aberto, mostrando a data quando tiver".
 * - Exclui PBIs já concluídos/fechados. Como não dá pra confiar numa lista fixa de valores
 *   exatos de State (cada squad usa uma convenção diferente — mesmo problema documentado em
 *   corDeEstadoDevOps/estadoIndicaConcluido em lib/kmm-theme.ts), a WIQL só exclui Removed e o
 *   filtro de "concluído" roda em JS reaproveitando `estadoIndicaConcluido()`.
 *
 * BUG corrigido em 2026-09-28 (Heder reportou a aba "Comitês" vazia mesmo com PBIs claramente com
 * a data marcada — ex.: #41987): a v1 usava `queryWorkItems()`, que busca os detalhes numa única
 * chamada GET (`wit/workitems?ids=...`) — só seguro pra conjuntos pequenos (comentário já existia
 * em cima da própria queryWorkItems). Um produto sozinho já tem 500+ PBIs com Data de Comitê
 * preenchida (WIQL bateu 526 só em KMM4, confirmado com scripts/checar-comite.mjs), bem acima do
 * limite de 200 ids por chamada da Azure DevOps REST API — a chamada de detalhes falhava (400) e
 * a tela caía silenciosamente pra lista vazia. Fix: pagina em lotes de 200 via `workitemsbatch`
 * (POST), mesmo padrão já usado em `fetchPbisParaSnapshot`/`getTasksAlocadas`.
 *
 * Outro bug corrigido junto: `Custom.PO` não é texto, é um campo de Identidade (mesmo formato de
 * `System.AssignedTo`) — vem como objeto `{ displayName, imageUrl, ... }`. A v1 fazia
 * `String(w.fields["Custom.PO"])`, que virava o literal "[object Object]" em vez do nome da
 * pessoa; corrigido pra extrair `displayName` (reaproveita o tipo `CampoPessoa` já usado em
 * getTasksAlocadas).
 *
 * Roda por TeamProject em `projetos` (o chamador passa KMM4 e/ou KMM5 — ver
 * lib/devops-projetos.ts).
 */
export async function getDemandasComite(projetos: string[]): Promise<DemandaComite[]> {
  const { org, pat } = getConfig();

  const porProjeto = await Promise.all(
    projetos.map(async (project) => {
      const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis`;
      // Só PBIs ainda no estado "Backlog" (pedido por Heder em 2026-09-28) — os já movidos
      // pra estados seguintes do fluxo (Doing, Done etc.) saem da lista mesmo com Data de
      // Comitê preenchida.
      const wiql = `
        SELECT [System.Id]
        FROM WorkItems
        WHERE [System.TeamProject] = '${project}'
          AND [System.WorkItemType] = 'Product Backlog Item'
          AND [System.State] = 'Backlog'
          AND [${CAMPO_DATA_COMITE}] <> ''
        ORDER BY [${CAMPO_DATA_COMITE}] ASC
      `;

      const wiqlRes = await fetch(`${base}/wit/wiql?api-version=${API_VERSION}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(pat) },
        body: JSON.stringify({ query: wiql }),
      });
      if (!wiqlRes.ok) {
        throw new Error(`Falha na consulta WIQL de Demandas de Comitê (${project}) (${wiqlRes.status}): ${await wiqlRes.text()}`);
      }
      const { workItems } = (await wiqlRes.json()) as { workItems: { id: number }[] };
      const ids = workItems.map((w) => w.id);
      if (!ids.length) return [];

      const lotes: number[][] = [];
      for (let i = 0; i < ids.length; i += 200) lotes.push(ids.slice(i, i + 200));

      const todos: WorkItem[] = [];
      for (const lote of lotes) {
        // errorPolicy:"Omit" — mesmo fix de getTasksAlocadas (achado por Heder em 2026-09-30): sem
        // isso, 1 item excluído/inacessível entre o WIQL e esta chamada derruba o lote inteiro.
        const res = await fetch(`${base}/wit/workitemsbatch?api-version=${API_VERSION}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader(pat) },
          body: JSON.stringify({ ids: lote, fields: CAMPOS_DEMANDA_COMITE, errorPolicy: "Omit" }),
        });
        if (!res.ok) {
          throw new Error(`Falha ao buscar lote de Demandas de Comitê (${project}) (${res.status}): ${await res.text()}`);
        }
        const { value } = (await res.json()) as { value: WorkItem[] };
        todos.push(...value);
      }
      return todos;
    })
  );

  return porProjeto
    .flat()
    .map((w) => {
      const po = w.fields["Custom.PO"] as CampoPessoa;
      return {
        id: w.id,
        titulo: String(w.fields["System.Title"] ?? `Item ${w.id}`),
        produto: String(w.fields["System.TeamProject"] ?? ""),
        areaPath: String(w.fields["System.AreaPath"] ?? ""),
        cliente: String(w.fields["Custom.Cliente"] ?? ""),
        po: po?.displayName ?? "",
        state: String(w.fields["System.State"] ?? ""),
        dataComite: (w.fields[CAMPO_DATA_COMITE] as string) ?? null,
      };
    })
    .filter((d) => !estadoIndicaConcluido(d.state));
}

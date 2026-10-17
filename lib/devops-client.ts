/**
 * Cliente para a Azure DevOps REST API.
 * Requer AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no ambiente. KMM4 e KMM5 são projetos separados
 * dentro dessa organização (ver lib/devops-projetos.ts) — por isso o projeto é sempre um parâmetro
 * explícito aqui, nunca uma variável de ambiente única.
 * O PAT precisa do escopo "Work Items → Read" (mesmo requisito já identificado no roadmap-panel).
 */


import {
  ETAPA_AGUARDANDO_PRIORIZACAO,
  ETAPA_EXECUCAO,
  HORAS_MAX_SPRINT,
  motivoBloqueioTask,
  sprintDoIterationPath,
  type PbiPriorizacao,
  type ResultadoEtapaPbi,
  type TaskDoPbi,
} from "./alocacao-pbi";
import { estadoIndicaConcluido } from "./kmm-theme";
import { ESTEIRAS_CLIENTES_SQUADS, type ItemBacklog } from "./backlog";
import { DEVOPS_PROJETOS, type Produto } from "./devops-projetos";
import { ESTADOS_GESTAO_CLIENTES, htmlParaTexto, norm, type PbiGestaoCliente, type UltimoComentario } from "./gestao-clientes";

// Toda chamada ao Azure DevOps neste módulo é SEM cache. O Next.js guarda no Data Cache o resultado
// de fetch() feito dentro de Route Handlers (inclusive POST de WIQL/workitemsbatch, que têm a mesma
// URL e corpo a cada leitura) — mesmo com `dynamic = "force-dynamic"` na rota. Resultado: depois de
// alterar um item no Azure o painel continuava mostrando a lista antiga (achado em 2026-10-14, Task
// #9359 alocada na 8.19 e ausente da leitura). Mesmo mecanismo que já nos pegou no cliente do
// Supabase (lib/supabase.ts). Este `fetch` local sombreia o global em todo o arquivo.
const fetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, { ...init, cache: "no-store" });

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
  // PBI pai da Task/Bug (id numérico) — usado pelo panel "Alocação por sprint" (2026-10-13)
  "System.Parent",
];

type CampoPessoa = { displayName?: string; imageUrl?: string; uniqueName?: string } | undefined;

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
  responsavel: { nome: string; avatarUrl: string | null; email: string | null } | null;
  /** System.Parent — id do PBI pai (null se a Task/Bug não tem pai). */
  pbiPaiId: number | null;
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
          ? { nome: assignedTo.displayName, avatarUrl: assignedTo.imageUrl ?? null, email: assignedTo.uniqueName ?? null }
          : null,
        pbiPaiId: typeof w.fields["System.Parent"] === "number" ? (w.fields["System.Parent"] as number) : null,
      };
    })
    .filter((t) => {
      const parsed = parseSprint(t.sprint);
      return parsed !== null && sprintEhIgualOuPosterior(parsed, sprintMinima);
    });
}

// ===== Panel "Alocação por sprint" (Roadmap e Entregas > Sprints, pedido por Heder em 2026-10-13):
// grade Dev/QA × Iteration. Precisa de 2 dados que a aba Sprints não carregava: o título dos PBIs
// pai das Tasks e as datas de início/fim de cada sprint. =====

export type ItemTitulo = { titulo: string; tipo: string; estado: string; cliente: string };

/**
 * Título e tipo de uma lista de work items por id (ex.: os PBIs pai das Tasks). Usa o endpoint
 * workitemsbatch no nível da ORGANIZAÇÃO (sem projeto na URL), então aceita ids de KMM4 e KMM5 na
 * mesma chamada. Lotes de 200 em paralelo; errorPolicy "Omit" pelo mesmo motivo de
 * getTasksAlocadas (id excluído/sem permissão não derruba o lote inteiro) — id que não voltar
 * simplesmente fica fora do resultado.
 */
export async function getTitulosPorIds(ids: number[]): Promise<Record<number, ItemTitulo>> {
  const { org, pat } = getConfig();
  const unicos = Array.from(new Set(ids.filter((n) => Number.isInteger(n) && n > 0)));
  if (!unicos.length) return {};

  const lotes: number[][] = [];
  for (let i = 0; i < unicos.length; i += 200) lotes.push(unicos.slice(i, i + 200));

  const todos = (
    await Promise.all(
      lotes.map(async (lote) => {
        const res = await fetch(`https://dev.azure.com/${org}/_apis/wit/workitemsbatch?api-version=${API_VERSION}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader(pat) },
          body: JSON.stringify({ ids: lote, fields: ["System.Title", "System.WorkItemType", "System.State", "Custom.Cliente"], errorPolicy: "Omit" }),
        });
        if (!res.ok) {
          throw new Error(`Falha ao buscar títulos de work items (${res.status}): ${await res.text()}`);
        }
        const { value } = (await res.json()) as { value: WorkItem[] };
        return value;
      })
    )
  ).flat();

  const resultado: Record<number, ItemTitulo> = {};
  for (const w of todos) {
    if (!w) continue;
    resultado[w.id] = {
      titulo: String(w.fields["System.Title"] ?? `Item ${w.id}`),
      tipo: String(w.fields["System.WorkItemType"] ?? ""),
      estado: String(w.fields["System.State"] ?? ""),
      cliente: String(w.fields["Custom.Cliente"] ?? ""),
    };
  }
  return resultado;
}

export type SprintComDatas = { nome: string; inicio: string | null; fim: string | null };

type NoIteracao = {
  name: string;
  attributes?: { startDate?: string; finishDate?: string };
  children?: NoIteracao[];
};

/**
 * Datas de início/fim de cada Iteration (sprint) de um projeto, lidas da árvore de iterations do
 * Azure DevOps (classificationnodes). Percorre a árvore em qualquer profundidade e devolve todo nó
 * que tem startDate/finishDate, pelo NOME do nó (é o mesmo texto de System.IterationLevel3 das
 * Tasks, ex. "Sprint 8.18" — assunção: as sprints ficam no 3º nível, project\2026\Sprint X.Y,
 * como já assume a WIQL de getTasksAlocadas). As datas vêm como datas puras (ex.
 * "2026-10-05T00:00:00Z") — quem usa deve ler só os 10 primeiros caracteres, sem converter de fuso.
 */
export async function getDatasSprints(project: string): Promise<SprintComDatas[]> {
  const { org, pat } = getConfig();
  const url = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/classificationnodes/iterations?$depth=6&api-version=${API_VERSION}`;
  const res = await fetch(url, { headers: authHeader(pat) });
  if (!res.ok) {
    throw new Error(`Falha ao ler as iterations de ${project} (${res.status}): ${await res.text()}`);
  }
  const raiz = (await res.json()) as NoIteracao;

  const sprints: SprintComDatas[] = [];
  const visitar = (no: NoIteracao) => {
    if (no.attributes?.startDate || no.attributes?.finishDate) {
      sprints.push({ nome: no.name, inicio: no.attributes.startDate ?? null, fim: no.attributes.finishDate ?? null });
    }
    no.children?.forEach(visitar);
  };
  visitar(raiz);
  return sprints;
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
  /** System.CreatedDate (ISO) — base da coluna calculada "Agging" (hoje − Created Date). */
  createdDate: string;
};

const CAMPOS_DEMANDA_COMITE = [
  "System.Title",
  "System.State",
  "System.TeamProject",
  "System.AreaPath",
  "Custom.Cliente",
  "Custom.PO",
  "System.CreatedDate",
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
 * - (v1, 2026-09-28) Excluía concluídos/fechados via `estadoIndicaConcluido()`. Substituído em
 *   2026-10-12 pela regra explícita State = 'Backlog' + Etapa = 'Comitê' na própria WIQL — o
 *   filtro em JS ficou redundante e foi removido.
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
      // Regra de inclusão da aba Comitês (confirmada por Heder em 2026-10-12): Item Type = PBI,
      // State = Backlog, Etapa (Custom.Etapa) = Comitê e Data Comitê preenchida. Os já movidos
      // pra outros estados/etapas saem da lista mesmo com Data de Comitê preenchida.
      const wiql = `
        SELECT [System.Id]
        FROM WorkItems
        WHERE [System.TeamProject] = '${project}'
          AND [System.WorkItemType] = 'Product Backlog Item'
          AND [System.State] = 'Backlog'
          AND [Custom.Etapa] = 'Comitê'
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
        createdDate: String(w.fields["System.CreatedDate"] ?? ""),
      };
    });
}

// ===== Backlog > Esteiras Clientes (pedido por Heder em 2026-10-14). Só leitura. =====

const CAMPO_CLASSIFICACAO = "Custom.67a95862-58a3-47f7-8f7c-285ec4d13106";

/** Texto de um campo que pode vir como string ou como identidade ({ displayName }). */
function textoDeCampo(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (valor && typeof valor === "object" && "displayName" in valor) return String((valor as { displayName?: string }).displayName ?? "");
  return "";
}

/**
 * PBIs com State = "Backlog" e Etapa = "Backlog" das squads de ESTEIRAS_CLIENTES_SQUADS, nos
 * projetos informados. Só consulta o projeto onde a squad existe (hoje todas ficam no KMM5; a WIQL
 * com Area Path inexistente falha com TF51011, então as áreas são conferidas antes).
 */
export async function getBacklogEsteirasClientes(projetos: string[]): Promise<ItemBacklog[]> {
  const { org, pat } = getConfig();

  const porProjeto = await Promise.all(
    projetos.map(async (project) => {
      const arvore = await fetch(
        `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/classificationnodes/areas?$depth=2&api-version=${API_VERSION}`,
        { headers: authHeader(pat) }
      );
      if (!arvore.ok) throw new Error(`Falha ao ler as áreas de ${project} (${arvore.status}): ${await arvore.text()}`);
      const existentes = new Set(((await arvore.json()) as { children?: { name: string }[] }).children?.map((c) => c.name) ?? []);
      const areas = ESTEIRAS_CLIENTES_SQUADS.filter((s) => existentes.has(s)).map((s) => `${project}\\${s}`);
      if (!areas.length) return [];

      const wiql = `
        SELECT [System.Id]
        FROM WorkItems
        WHERE [System.TeamProject] = '${aspasWiql(project)}'
          AND [System.WorkItemType] = 'Product Backlog Item'
          AND [System.State] = 'Backlog'
          AND [Custom.Etapa] = 'Backlog'
          AND (${areas.map((a) => `[System.AreaPath] UNDER '${aspasWiql(a)}'`).join(" OR ")})
        ORDER BY [System.Id]
      `;
      const wiqlRes = await fetch(`https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=${API_VERSION}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(pat) },
        body: JSON.stringify({ query: wiql }),
      });
      if (!wiqlRes.ok) throw new Error(`Falha na consulta WIQL do Backlog (${project}) (${wiqlRes.status}): ${await wiqlRes.text()}`);
      const ids = ((await wiqlRes.json()) as { workItems: { id: number }[] }).workItems.map((w) => w.id);
      if (!ids.length) return [];

      return buscarLoteCampos(org, pat, ids, [
        "System.Title",
        "System.AreaPath",
        "System.CreatedDate",
        "Custom.Cliente",
        "Custom.PO",
        "Custom.DataAberturaProduto",
        CAMPO_CLASSIFICACAO,
        "Custom.Feature",
        "Microsoft.VSTS.Common.Priority",
      ]);
    })
  );

  return porProjeto.flat().map((w) => {
    const prioridade = w.fields["Microsoft.VSTS.Common.Priority"];
    return {
      id: w.id,
      titulo: String(w.fields["System.Title"] ?? `Item ${w.id}`),
      areaPath: String(w.fields["System.AreaPath"] ?? ""),
      cliente: textoDeCampo(w.fields["Custom.Cliente"]),
      po: textoDeCampo(w.fields["Custom.PO"]),
      createdDate: String(w.fields["System.CreatedDate"] ?? ""),
      dataAberturaProduto: (w.fields["Custom.DataAberturaProduto"] as string) ?? null,
      classificacao: textoDeCampo(w.fields[CAMPO_CLASSIFICACAO]),
      feature: textoDeCampo(w.fields["Custom.Feature"]),
      prioridade: typeof prioridade === "number" ? prioridade : null,
    };
  });
}

// ===== Alocar PBI (Planejamento de capacidade, pedido por Heder em 2026-10-14) — ÚNICA parte deste
// cliente que ESCREVE no Azure DevOps (o resto é só leitura). Exige PAT com Work Items → Read &
// write. Chamada só por rotas restritas a admin (ver app/api/capacidade/alocar-task). =====

function aspasWiql(valor: string): string {
  return valor.replace(/'/g, "''");
}

async function buscarLoteCampos(org: string, pat: string, ids: number[], fields: string[]): Promise<WorkItem[]> {
  const lotes: number[][] = [];
  for (let i = 0; i < ids.length; i += 200) lotes.push(ids.slice(i, i + 200));
  const partes = await Promise.all(
    lotes.map(async (lote) => {
      const res = await fetch(`https://dev.azure.com/${org}/_apis/wit/workitemsbatch?api-version=${API_VERSION}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(pat) },
        body: JSON.stringify({ ids: lote, fields, errorPolicy: "Omit" }),
      });
      if (!res.ok) throw new Error(`Falha ao buscar work items (${res.status}): ${await res.text()}`);
      return ((await res.json()) as { value: WorkItem[] }).value;
    })
  );
  return partes.flat().filter(Boolean);
}

function taskDoPbiDe(w: WorkItem): TaskDoPbi {
  const pessoa = w.fields["System.AssignedTo"] as CampoPessoa;
  const esforco = w.fields["Microsoft.VSTS.Scheduling.Effort"];
  const iterationPath = String(w.fields["System.IterationPath"] ?? "");
  return {
    id: w.id,
    titulo: String(w.fields["System.Title"] ?? `Item ${w.id}`),
    tipo: String(w.fields["System.WorkItemType"] ?? ""),
    state: String(w.fields["System.State"] ?? ""),
    iterationPath,
    sprint: sprintDoIterationPath(iterationPath),
    responsavel: pessoa?.displayName ?? null,
    esforco: typeof esforco === "number" ? esforco : null,
  };
}

/**
 * PBIs na etapa "Aguardando Priorização" (Custom.Etapa) de UMA squad (Area Path exato, ex.
 * "KMM5\TMS - Dedicada Maroni"), com suas Tasks/Bugs filhas diretas. Concluídos/cancelados ficam de
 * fora (a consulta de hoje traz PBI "Finalizado" nessa etapa). Filhos que não são Task/Bug (ex.
 * "Assesment") são ignorados.
 */
export async function getPbisAguardandoPriorizacao(areaPath: string): Promise<PbiPriorizacao[]> {
  const { org, pat } = getConfig();
  const project = areaPath.split("\\")[0];
  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = '${aspasWiql(project)}'
      AND [System.WorkItemType] = 'Product Backlog Item'
      AND [Custom.Etapa] = '${ETAPA_AGUARDANDO_PRIORIZACAO}'
      AND [System.AreaPath] = '${aspasWiql(areaPath)}'
    ORDER BY [System.Id]
  `;
  const wiqlRes = await fetch(`https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(pat) },
    body: JSON.stringify({ query: wiql }),
  });
  if (!wiqlRes.ok) throw new Error(`Falha na consulta WIQL de PBIs em priorização (${wiqlRes.status}): ${await wiqlRes.text()}`);
  const ids = ((await wiqlRes.json()) as { workItems: { id: number }[] }).workItems.map((w) => w.id);
  if (!ids.length) return [];

  const pbisBrutos = (
    await buscarLoteCampos(org, pat, ids, [
      "System.Title",
      "System.State",
      "System.AreaPath",
      "Custom.Cliente",
      "Microsoft.VSTS.Scheduling.Effort",
    ])
  ).filter(
    (w) => !estadoIndicaConcluido(String(w.fields["System.State"] ?? "")) && !/cancel|remov/i.test(String(w.fields["System.State"] ?? ""))
  );

  return Promise.all(
    pbisBrutos.map(async (pbi) => {
      const res = await fetch(`https://dev.azure.com/${org}/_apis/wit/workitems/${pbi.id}?$expand=relations&api-version=${API_VERSION}`, {
        headers: authHeader(pat),
      });
      if (!res.ok) throw new Error(`Falha ao ler as relações do PBI #${pbi.id} (${res.status}): ${await res.text()}`);
      const j = (await res.json()) as { relations?: { rel: string; url: string }[] };
      const idsFilhos = (j.relations ?? [])
        .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
        .map((r) => Number(r.url.split("/").pop()))
        .filter((n) => Number.isFinite(n));
      const filhos = idsFilhos.length
        ? await buscarLoteCampos(org, pat, idsFilhos, [
            "System.Title",
            "System.WorkItemType",
            "System.State",
            "System.IterationPath",
            "System.AssignedTo",
            "Microsoft.VSTS.Scheduling.Effort",
          ])
        : [];
      return {
        id: pbi.id,
        titulo: String(pbi.fields["System.Title"] ?? `Item ${pbi.id}`),
        state: String(pbi.fields["System.State"] ?? ""),
        areaPath: String(pbi.fields["System.AreaPath"] ?? areaPath),
        cliente: pbi.fields["Custom.Cliente"] ? String(pbi.fields["Custom.Cliente"]) : null,
        esforco: typeof pbi.fields["Microsoft.VSTS.Scheduling.Effort"] === "number" ? (pbi.fields["Microsoft.VSTS.Scheduling.Effort"] as number) : null,
        tasks: filhos.map(taskDoPbiDe).filter((t) => t.tipo === "Task" || t.tipo === "Bug").sort((a, b) => a.id - b.id),
      };
    })
  );
}

/** Erro de regra de negócio (400/404/409) — a rota devolve a mensagem ao usuário em vez de um 502 genérico. */
export class ErroAlocacao extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Caminho gravável da Iteration ("KMM5\2026\Sprint 8.18") a partir do NOME da sprint. */
async function caminhoDaIteration(org: string, pat: string, project: string, sprint: string): Promise<string | null> {
  const res = await fetch(
    `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/classificationnodes/iterations?$depth=6&api-version=${API_VERSION}`,
    { headers: authHeader(pat) }
  );
  if (!res.ok) throw new Error(`Falha ao ler as iterations de ${project} (${res.status}): ${await res.text()}`);
  type NoComPath = NoIteracao & { path?: string; children?: NoComPath[] };
  let achado: string | null = null;
  const visitar = (no: NoComPath) => {
    if (no.name === sprint && no.path) achado = no.path;
    no.children?.forEach(visitar);
  };
  visitar((await res.json()) as NoComPath);
  if (!achado) return null;
  // O nó vem como "\KMM5\Iteration\2026\Sprint 8.18"; o work item usa "KMM5\2026\Sprint 8.18".
  return (achado as string).replace(/^\\/, "").replace(/^([^\\]+)\\Iteration/, "$1");
}

/** Confere que o Area Path existe na árvore de áreas do projeto (evita gravar uma área inventada). */
async function areaPathExiste(org: string, pat: string, project: string, areaPath: string): Promise<boolean> {
  const res = await fetch(
    `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/classificationnodes/areas?$depth=6&api-version=${API_VERSION}`,
    { headers: authHeader(pat) }
  );
  if (!res.ok) throw new Error(`Falha ao ler as áreas de ${project} (${res.status}): ${await res.text()}`);
  type NoArea = { path?: string; children?: NoArea[] };
  let achou = false;
  const visitar = (no: NoArea) => {
    // O nó vem como "\KMM5\Area\TMS - Dedicada Maroni"; o work item usa "KMM5\TMS - Dedicada Maroni".
    const normal = no.path?.replace(/^\\/, "").replace(/^([^\\]+)\\Area/, "$1");
    if (normal === areaPath) achou = true;
    no.children?.forEach(visitar);
  };
  visitar((await res.json()) as NoArea);
  return achou;
}

/**
 * Muda a Iteration da Task/Bug pra `sprint`, o Area Path pra `areaPath` (a squad do bloco) e atribui
 * ao dev — as únicas alterações feitas no Azure. Revalida no servidor (nunca confia só na tela):
 * item em Backlog/sem sprint, com esforço entre 1 e 60h, Area Path existente no mesmo projeto, e
 * dev com menos de 60h já alocadas naquela sprint. O `test /rev` do PATCH recusa a gravação se
 * alguém editou o item depois da leitura.
 */
export async function alocarTaskEmSprint(params: {
  taskId: number;
  sprint: string;
  devNome: string;
  areaPath: string;
}): Promise<{ etapaPbi: ResultadoEtapaPbi | null }> {
  const { org, pat } = getConfig();
  const { taskId, sprint, devNome, areaPath } = params;

  const res = await fetch(
    `https://dev.azure.com/${org}/_apis/wit/workitems/${taskId}?fields=System.TeamProject,System.WorkItemType,System.State,System.IterationPath,System.Parent,Microsoft.VSTS.Scheduling.Effort&api-version=${API_VERSION}`,
    { headers: authHeader(pat) }
  );
  if (res.status === 404) throw new ErroAlocacao(`Item #${taskId} não encontrado no Azure DevOps.`, 404);
  if (!res.ok) throw new Error(`Falha ao ler o item #${taskId} (${res.status}): ${await res.text()}`);
  const item = (await res.json()) as WorkItem & { rev: number };
  const tipo = String(item.fields["System.WorkItemType"] ?? "");
  if (tipo !== "Task" && tipo !== "Bug") throw new ErroAlocacao(`Item #${taskId} é ${tipo || "de outro tipo"} — só Task e Bug podem ser alocados.`, 400);

  const task = taskDoPbiDe(item);
  const bloqueio = motivoBloqueioTask(task);
  if (bloqueio) throw new ErroAlocacao(`Item #${taskId} não pode ser alocado: ${bloqueio}.`, 409);

  const project = String(item.fields["System.TeamProject"] ?? "");
  const caminho = await caminhoDaIteration(org, pat, project, sprint);
  if (!caminho) throw new ErroAlocacao(`Sprint "${sprint}" não encontrada nas iterations de ${project}.`, 400);
  if (areaPath.split("\\")[0] !== project || !(await areaPathExiste(org, pat, project, areaPath))) {
    throw new ErroAlocacao(`Area Path "${areaPath}" não existe no projeto ${project}.`, 400);
  }

  // Horas já alocadas do dev nessa sprint (mesma conta do quadro: soma do Effort das Task/Bug dele).
  // Busca todas as sprints (mínima 0.0) pra achar o e-mail do dev em QUALQUER item dele, não só nos
  // da sprint de destino — quem ainda não tem nada nessa sprint também precisa ser identificado.
  const doDev = (await getTasksAlocadas(project, { major: 0, minor: 0 })).filter((t) => t.responsavel?.nome === devNome);
  const daSprint = doDev.filter((t) => t.sprint === sprint);
  const horas = daSprint.reduce((acc, t) => acc + (t.spEstimados ?? 0), 0);
  if (horas >= HORAS_MAX_SPRINT) {
    throw new ErroAlocacao(`${devNome} já tem ${Math.round(horas)}h alocadas na ${sprint} (limite de ${HORAS_MAX_SPRINT}h).`, 409);
  }
  // E-mail (uniqueName) identifica a pessoa sem ambiguidade; sem ele (dev sem nenhum item no
  // Azure), cai no nome de exibição.
  const identidade = doDev.find((t) => t.responsavel?.email)?.responsavel?.email ?? devNome;

  const patch = await fetch(`https://dev.azure.com/${org}/_apis/wit/workitems/${taskId}?api-version=${API_VERSION}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json", ...authHeader(pat) },
    body: JSON.stringify([
      { op: "test", path: "/rev", value: item.rev },
      { op: "add", path: "/fields/System.IterationPath", value: caminho },
      { op: "add", path: "/fields/System.AreaPath", value: areaPath },
      { op: "add", path: "/fields/System.AssignedTo", value: identidade },
    ]),
  });
  if (!patch.ok) {
    const corpo = await patch.text();
    if (patch.status === 409 || patch.status === 412) throw new ErroAlocacao(`O item #${taskId} foi alterado por outra pessoa. Recarregue e tente de novo.`, 409);
    if (patch.status === 401 || patch.status === 403) throw new ErroAlocacao("O token do Azure DevOps não tem permissão de escrita em Work Items.", 502);
    throw new Error(`Falha ao atualizar o item #${taskId} (${patch.status}): ${corpo}`);
  }

  // A Task já foi gravada: qualquer problema na Etapa do PBI vira aviso, nunca um erro que faria o
  // usuário achar que a alocação falhou.
  const pbiId = typeof item.fields["System.Parent"] === "number" ? (item.fields["System.Parent"] as number) : null;
  if (pbiId == null) return { etapaPbi: null };
  try {
    return { etapaPbi: await promoverPbiParaExecucao(org, pat, pbiId) };
  } catch (err) {
    console.error(`[alocarTaskEmSprint] Task #${taskId} alocada, mas falhou ao atualizar a Etapa do PBI #${pbiId}:`, err);
    return { etapaPbi: { pbiId, atualizada: false, aviso: `A Task foi alocada, mas não consegui atualizar a Etapa do PBI #${pbiId} para ${ETAPA_EXECUCAO}. Altere manualmente no Azure DevOps.` } };
  }
}

/**
 * Se o PBI está em "Aguardando Priorização" e TODAS as suas Tasks/Bugs (ignorando removidas e
 * canceladas) já têm sprint, muda a Etapa pra "Execução". Lê o estado atual do Azure (já com a Task
 * recém-alocada), então a decisão não depende de dados da tela. Não mexe em PBI que esteja em outra
 * Etapa. `test /rev` evita sobrescrever uma edição concorrente.
 */
async function promoverPbiParaExecucao(org: string, pat: string, pbiId: number): Promise<ResultadoEtapaPbi> {
  const res = await fetch(`https://dev.azure.com/${org}/_apis/wit/workitems/${pbiId}?$expand=relations&api-version=${API_VERSION}`, {
    headers: authHeader(pat),
  });
  if (!res.ok) throw new Error(`Falha ao ler o PBI #${pbiId} (${res.status}): ${await res.text()}`);
  const pbi = (await res.json()) as WorkItem & { rev: number; relations?: { rel: string; url: string }[] };

  if (String(pbi.fields["System.WorkItemType"] ?? "") !== "Product Backlog Item") return { pbiId, atualizada: false };
  if (String(pbi.fields["Custom.Etapa"] ?? "") !== ETAPA_AGUARDANDO_PRIORIZACAO) return { pbiId, atualizada: false };

  const idsFilhos = (pbi.relations ?? [])
    .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
    .map((r) => Number(r.url.split("/").pop()))
    .filter((n) => Number.isFinite(n));
  const filhos = idsFilhos.length
    ? await buscarLoteCampos(org, pat, idsFilhos, ["System.WorkItemType", "System.State", "System.IterationPath"])
    : [];
  const consideradas = filhos
    .filter((w) => ["Task", "Bug"].includes(String(w.fields["System.WorkItemType"] ?? "")))
    .filter((w) => !/cancel|remov/i.test(String(w.fields["System.State"] ?? "")));
  const todasAlocadas = consideradas.length > 0 && consideradas.every((w) => sprintDoIterationPath(String(w.fields["System.IterationPath"] ?? "")) !== null);
  if (!todasAlocadas) return { pbiId, atualizada: false };

  const patch = await fetch(`https://dev.azure.com/${org}/_apis/wit/workitems/${pbiId}?api-version=${API_VERSION}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json", ...authHeader(pat) },
    body: JSON.stringify([
      { op: "test", path: "/rev", value: pbi.rev },
      { op: "add", path: "/fields/Custom.Etapa", value: ETAPA_EXECUCAO },
    ]),
  });
  if (!patch.ok) throw new Error(`Falha ao atualizar a Etapa do PBI #${pbiId} (${patch.status}): ${await patch.text()}`);
  return { pbiId, atualizada: true };
}


// ===== Gestão de clientes (pedido por Heder em 2026-10-17). Só leitura. =====

let cacheCampoIdExterno: { ref: string | null; ate: number } | null = null;

/**
 * Reference name do campo "ID Externo". É um campo custom (o reference name exato não é conhecido
 * com certeza — erro real em 2026-09-20: um reference name chutado derrubou o lote inteiro com
 * 400/TF51535), então ele é DESCOBERTO pela lista de campos da organização (casando pelo nome
 * exibido "ID Externo") e guardado em memória por 1h. Override opcional por
 * AZURE_DEVOPS_CAMPO_ID_EXTERNO. Se não achar, devolve null: a tela segue sem a coluna Chamado
 * preenchida e avisa — nunca derruba o carregamento.
 */
async function resolverCampoIdExterno(org: string, pat: string): Promise<string | null> {
  const override = process.env.AZURE_DEVOPS_CAMPO_ID_EXTERNO?.trim();
  if (override) return override;
  if (cacheCampoIdExterno && cacheCampoIdExterno.ate > Date.now()) return cacheCampoIdExterno.ref;

  let ref: string | null = null;
  try {
    const res = await fetch(`https://dev.azure.com/${org}/_apis/wit/fields?api-version=${API_VERSION}`, { headers: authHeader(pat) });
    if (res.ok) {
      const lista = ((await res.json()) as { value?: { name: string; referenceName: string }[] }).value ?? [];
      const alvo = lista.find((f) => norm(f.name) === "id externo") ?? lista.find((f) => norm(f.name).replace(/[\s_-]/g, "") === "idexterno");
      ref = alvo?.referenceName ?? null;
    } else {
      console.error(`[gestao-clientes] falha ao listar campos (${res.status}): ${await res.text()}`);
    }
  } catch (err) {
    console.error("[gestao-clientes] falha ao listar campos do Azure DevOps:", err);
  }
  cacheCampoIdExterno = { ref, ate: Date.now() + (ref ? 3_600_000 : 60_000) };
  return ref;
}

/**
 * PBIs (e só PBIs) dos produtos informados com State em ESTADOS_GESTAO_CLIENTES, nas áreas do
 * produto (mesmo escopo da captura dos indicadores: Area Paths de DEVOPS_PROJETOS + raiz do
 * projeto — assim o Agging bate com o da tela principal). Uma WIQL por status e por projeto, via
 * allSettled: se um nome de status não existir num dos projetos (a WIQL rejeita valor de State
 * inválido), só aquele status some e a tela recebe um aviso, em vez de falhar inteira.
 */
export async function getPbisGestaoClientes(
  produtos: Produto[]
): Promise<{ itens: PbiGestaoCliente[]; avisos: string[] }> {
  const { org, pat } = getConfig();
  const avisos: string[] = [];
  const campoIdExterno = await resolverCampoIdExterno(org, pat);
  if (!campoIdExterno) avisos.push('Campo "ID Externo" não encontrado no Azure DevOps — a coluna Chamado ficará vazia.');

  const porProjeto = await Promise.all(
    produtos.map(async (produto) => {
      const { project, areaPaths } = DEVOPS_PROJETOS[produto];
      const resultados = await Promise.allSettled(
        ESTADOS_GESTAO_CLIENTES.map(async (estado) => {
          const wiql = `
            SELECT [System.Id]
            FROM WorkItems
            WHERE [System.TeamProject] = '${aspasWiql(project)}'
              AND ${clausulaAreaPathsComRaiz(project, areaPaths)}
              AND [System.WorkItemType] = 'Product Backlog Item'
              AND [System.State] = '${aspasWiql(estado)}'
            ORDER BY [System.Id]
          `;
          const res = await fetch(`https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=${API_VERSION}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader(pat) },
            body: JSON.stringify({ query: wiql }),
          });
          if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
          return ((await res.json()) as { workItems: { id: number }[] }).workItems.map((w) => w.id);
        })
      );
      const ids = new Set<number>();
      resultados.forEach((r, i) => {
        if (r.status === "fulfilled") r.value.forEach((id) => ids.add(id));
        else {
          console.error(`[gestao-clientes] WIQL do status "${ESTADOS_GESTAO_CLIENTES[i]}" falhou em ${project}:`, r.reason);
          avisos.push(`Status "${ESTADOS_GESTAO_CLIENTES[i]}" não pôde ser consultado em ${project} (nome inexistente no board?).`);
        }
      });
      return { project, ids: Array.from(ids) };
    })
  );

  const campos = [
    "System.Title",
    "System.State",
    "System.AreaPath",
    "System.TeamProject",
    "System.CreatedDate",
    "System.CommentCount",
    "Custom.Etapa",
    "Custom.PO",
    "Custom.Cliente",
    "Custom.DataAberturaProduto",
    CAMPO_CLASSIFICACAO,
    CAMPO_DATA_COMITE,
    "Microsoft.VSTS.Scheduling.Effort",
    ...(campoIdExterno ? [campoIdExterno] : []),
  ];

  const itens: PbiGestaoCliente[] = [];
  for (const { project, ids } of porProjeto) {
    if (!ids.length) continue;
    const works = await buscarLoteCampos(org, pat, ids, campos);
    for (const w of works) {
      const f = w.fields;
      const qtd = f["System.CommentCount"];
      itens.push({
        id: w.id,
        projeto: String(f["System.TeamProject"] ?? project),
        idExterno: campoIdExterno ? textoDeCampo(f[campoIdExterno]) || (f[campoIdExterno] != null ? String(f[campoIdExterno]).trim() : "") : "",
        titulo: String(f["System.Title"] ?? `Item ${w.id}`),
        state: String(f["System.State"] ?? ""),
        etapa: textoDeCampo(f["Custom.Etapa"]),
        po: textoDeCampo(f["Custom.PO"]),
        areaPath: String(f["System.AreaPath"] ?? ""),
        cliente: textoDeCampo(f["Custom.Cliente"]),
        createdDate: String(f["System.CreatedDate"] ?? ""),
        dataAberturaProduto: (f["Custom.DataAberturaProduto"] as string) ?? null,
        classificacao: textoDeCampo(f[CAMPO_CLASSIFICACAO]),
        dataComite: (f[CAMPO_DATA_COMITE] as string) ?? null,
        effort: typeof f["Microsoft.VSTS.Scheduling.Effort"] === "number" ? (f["Microsoft.VSTS.Scheduling.Effort"] as number) : null,
        qtdComentarios: typeof qtd === "number" ? qtd : 0,
      });
    }
  }
  return { itens, avisos };
}

/**
 * Último comentário (aba Discussão) de cada PBI informado. O Azure só entrega comentários por
 * work item (1 chamada cada), então o chamador manda LOTES pequenos e só dos PBIs com
 * System.CommentCount > 0; aqui roda com concorrência limitada. Falha num item vira null (a tela
 * mostra "—") sem derrubar o lote.
 */
export async function getUltimosComentarios(
  itens: { id: number; projeto: string }[]
): Promise<Record<number, UltimoComentario | null>> {
  const { org, pat } = getConfig();
  const saida: Record<number, UltimoComentario | null> = {};
  const fila = [...itens];
  const CONCORRENCIA = 8;

  async function trabalhador() {
    for (let item = fila.shift(); item; item = fila.shift()) {
      try {
        const url = `https://dev.azure.com/${org}/${encodeURIComponent(item.projeto)}/_apis/wit/workItems/${item.id}/comments?$top=1&order=desc&api-version=7.1-preview.4`;
        const res = await fetch(url, { headers: authHeader(pat) });
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        const c = ((await res.json()) as { comments?: { text?: string; createdBy?: { displayName?: string }; createdDate?: string }[] }).comments?.[0];
        saida[item.id] = c
          ? { texto: htmlParaTexto(c.text), autor: c.createdBy?.displayName ?? "", data: c.createdDate ?? "" }
          : null;
      } catch (err) {
        console.error(`[gestao-clientes] falha ao ler comentário do PBI ${item.id}:`, err);
        saida[item.id] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, itens.length) }, trabalhador));
  return saida;
}

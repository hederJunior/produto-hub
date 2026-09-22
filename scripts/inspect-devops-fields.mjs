// Diagnóstico: lista TODOS os campos de um work item real, pra identificar o nome técnico
// (reference name) de campos de negócio como "Cliente", "Data Abertura Produto".
//
// IMPORTANTE: filtra também por Area Path (não só por projeto na URL + tipo). Descobrimos em
// 2026-09-19 que uma WIQL sem filtro de Area Path, mesmo escopada por projeto na URL, pode
// retornar um item de OUTRO projeto (ver docs/decisoes-e-conhecimento.md) — então toda consulta
// neste org deve sempre incluir Area Path (ou TeamProject) explícito, nunca confiar só na URL.
//
// Uso: node --env-file=.env scripts/inspect-devops-fields.mjs

const ORG = process.env.AZURE_DEVOPS_ORG;
const PAT = process.env.AZURE_DEVOPS_PAT;
const API_VERSION = "7.1";
const authHeader = { Authorization: "Basic " + Buffer.from(`:${PAT}`).toString("base64") };

if (!ORG || !PAT) {
  console.error("Defina AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no .env antes de rodar este script.");
  process.exit(1);
}

// Mantido em sync manualmente com lib/devops-projetos.ts.
const DEVOPS_PROJETOS = {
  KMM4: { project: "KMM4", areaPaths: ["KMM4\\TMS - Rangers", "KMM4\\TMS - BeeSharp", "KMM4\\TMS - Debitos Tecnicos", "KMM4\\TMS - Melhorias", "KMM4\\TMS - DreamTeam", "KMM4\\TMS - Roadmap", "KMM4\\TMS - EDI e Fast Track"] },
  KMM5: { project: "KMM5", areaPaths: ["KMM5\\TMS - Dedicada Maroni", "KMM5\\TMS - Dedicada Transben", "KMM5\\TMS - Ecossistema", "KMM5\\TMS - Melhorias", "KMM5\\TMS - Migracao", "KMM5\\TMS - Obrigacoes Legais e Financeiras", "KMM5\\TMS - Projetos de Implantacao", "KMM5\\TMS - Serviços da Carteira"] },
};

async function umItemProductBacklogItem(project, areaPaths) {
  const base = `https://dev.azure.com/${ORG}/${encodeURIComponent(project)}/_apis`;
  const clausulaAreaPaths = "(" + areaPaths.map((ap) => `[System.AreaPath] UNDER '${ap}'`).join(" OR ") + ")";
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${project}' AND ${clausulaAreaPaths} AND [System.WorkItemType] = 'Product Backlog Item' AND [System.State] NOT IN ('Removed') ORDER BY [System.ChangedDate] DESC`;

  const wiqlRes = await fetch(`${base}/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ query: wiql }),
  });
  if (!wiqlRes.ok) throw new Error(`HTTP ${wiqlRes.status} na WIQL de "${project}": ${await wiqlRes.text()}`);

  const { workItems } = await wiqlRes.json();
  if (!workItems?.length) {
    console.log(`(nenhum "Product Backlog Item" encontrado em ${project} — confira o nome do tipo)`);
    return null;
  }

  const id = workItems[0].id;
  const itemRes = await fetch(`${base}/wit/workitems/${id}?$expand=all&api-version=${API_VERSION}`, {
    headers: authHeader,
  });
  if (!itemRes.ok) throw new Error(`HTTP ${itemRes.status} ao buscar item ${id} de "${project}": ${await itemRes.text()}`);

  return itemRes.json();
}

for (const [produto, { project, areaPaths }] of Object.entries(DEVOPS_PROJETOS)) {
  console.log(`\n========== ${produto} (projeto "${project}") ==========`);
  try {
    const item = await umItemProductBacklogItem(project, areaPaths);
    if (!item) continue;
    console.log(`Work Item #${item.id} — ${item.fields["System.Title"]}`);
    console.log(`System.TeamProject = ${item.fields["System.TeamProject"]}  (esperado: ${project})\n`);
    if (item.fields["System.TeamProject"] !== project) {
      console.log("⚠️  ATENÇÃO: TeamProject não bate com o projeto consultado!\n");
    }
    const entradas = Object.entries(item.fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [campo, valor] of entradas) {
      const valorTexto = typeof valor === "object" ? JSON.stringify(valor) : String(valor);
      console.log(`${campo.padEnd(45)} = ${valorTexto}`);
    }
  } catch (err) {
    console.error(`❌ ${produto}: ${err.message}`);
  }
}

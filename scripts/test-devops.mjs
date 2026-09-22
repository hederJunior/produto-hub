// Diagnóstico manual da conexão com o Azure DevOps (fora do Next.js).
// Uso: node --env-file=.env scripts/test-devops.mjs
//
// Confirma, pra cada produto, que ORG + PAT + nome do projeto + Area Paths configurados em
// lib/devops-projetos.ts realmente batem com o que existe no Azure DevOps — antes de usar isso
// nas telas de verdade (Roadmap, Indicadores).

const ORG = process.env.AZURE_DEVOPS_ORG;
const PAT = process.env.AZURE_DEVOPS_PAT;

if (!ORG || !PAT) {
  console.error("Defina AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no .env antes de rodar este script.");
  process.exit(1);
}

// Mantido em sync manualmente com lib/devops-projetos.ts (este script não importa TS diretamente).
const DEVOPS_PROJETOS = {
  KMM4: {
    project: "KMM4",
    areaPaths: [
      "KMM4\\TMS - Rangers",
      "KMM4\\TMS - BeeSharp",
      "KMM4\\TMS - Debitos Tecnicos",
      "KMM4\\TMS - Melhorias",
      "KMM4\\TMS - DreamTeam",
      "KMM4\\TMS - Roadmap",
      "KMM4\\TMS - EDI e Fast Track",
    ],
  },
  KMM5: {
    project: "KMM5",
    areaPaths: [
      "KMM5\\TMS - Dedicada Maroni",
      "KMM5\\TMS - Dedicada Transben",
      "KMM5\\TMS - Ecossistema",
      "KMM5\\TMS - Melhorias",
      "KMM5\\TMS - Migracao",
      "KMM5\\TMS - Obrigacoes Legais e Financeiras",
      "KMM5\\TMS - Projetos de Implantacao",
      "KMM5\\TMS - Serviços da Carteira",
    ],
  },
};

const API_VERSION = "7.1";
const authHeader = { Authorization: "Basic " + Buffer.from(`:${PAT}`).toString("base64") };

async function contarWorkItemsAtivos(project, areaPaths) {
  const base = `https://dev.azure.com/${ORG}/${encodeURIComponent(project)}/_apis`;
  const clausula = "(" + areaPaths.map((ap) => `[System.AreaPath] UNDER '${ap}'`).join(" OR ") + ")";
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${clausula} AND [System.State] NOT IN ('Closed', 'Removed')`;

  const res = await fetch(`${base}/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ query: wiql }),
  });

  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`HTTP ${res.status} ao consultar projeto "${project}": ${texto}`);
  }

  const { workItems } = await res.json();
  return workItems?.length ?? 0;
}

let algumErro = false;
for (const [produto, { project, areaPaths }] of Object.entries(DEVOPS_PROJETOS)) {
  try {
    const total = await contarWorkItemsAtivos(project, areaPaths);
    console.log(`✅ ${produto} (projeto "${project}", ${areaPaths.length} area paths): ${total} work items ativos`);
  } catch (err) {
    algumErro = true;
    console.error(`❌ ${produto} (projeto "${project}"): ${err.message}`);
  }
}

process.exit(algumErro ? 1 : 0);

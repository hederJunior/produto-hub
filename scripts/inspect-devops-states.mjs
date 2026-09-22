// Lista os estados válidos de "Product Backlog Item" em KMM4 e KMM5, com a categoria de cada um
// (Proposed | InProgress | Resolved | Completed | Removed) — a Azure DevOps já classifica isso,
// então não precisamos adivinhar quais strings de State contam como "Encerrada" ou "Cancelada"
// pro painel "Fluxo de demandas" do PRD F01.01.
// Rodar localmente: node --env-file=.env scripts/inspect-devops-states.mjs

const org = process.env.AZURE_DEVOPS_ORG;
const pat = process.env.AZURE_DEVOPS_PAT;
const auth = "Basic " + Buffer.from(`:${pat}`).toString("base64");

const PROJETOS = ["KMM4", "KMM5"];
const TIPO = "Product Backlog Item";

for (const project of PROJETOS) {
  console.log(`\n========== ${project} ==========`);
  const url = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/workitemtypes/${encodeURIComponent(TIPO)}/states?api-version=7.1`;
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) {
    console.log(`Falha (${res.status}): ${await res.text()}`);
    continue;
  }
  const { value } = await res.json();
  for (const estado of value) {
    console.log(`  ${estado.name.padEnd(20)} categoria: ${estado.category}`);
  }
}

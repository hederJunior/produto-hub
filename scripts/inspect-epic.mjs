// Diagnóstico: inspeciona um EPIC específico (todos os campos + relations) e, se pedido,
// também os work items filhos diretos (pra achar o reference name de campos como "Produto",
// "Start Date"/"Target Date" nas Features). Uso:
//   node --env-file=.env scripts/inspect-epic.mjs 15057
//   node --env-file=.env scripts/inspect-epic.mjs 15057 --filhos   (também expande os filhos)

const ORG = process.env.AZURE_DEVOPS_ORG;
const PAT = process.env.AZURE_DEVOPS_PAT;
const API_VERSION = "7.1";
const authHeader = { Authorization: "Basic " + Buffer.from(`:${PAT}`).toString("base64") };

const id = process.argv[2];
const comFilhos = process.argv.includes("--filhos");

if (!ORG || !PAT) {
  console.error("Defina AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no .env antes de rodar este script.");
  process.exit(1);
}
if (!id) {
  console.error("Uso: node --env-file=.env scripts/inspect-epic.mjs <id> [--filhos]");
  process.exit(1);
}

async function buscarItem(itemId) {
  const url = `https://dev.azure.com/${ORG}/_apis/wit/workitems/${itemId}?$expand=all&api-version=${API_VERSION}`;
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar item ${itemId}: ${await res.text()}`);
  return res.json();
}

function imprimirItem(item) {
  console.log(`\n===== #${item.id} — ${item.fields["System.Title"]} =====`);
  console.log(`Tipo: ${item.fields["System.WorkItemType"]}`);
  console.log(`Projeto: ${item.fields["System.TeamProject"]}`);
  console.log(`Area Path: ${item.fields["System.AreaPath"]}`);
  console.log(`\n--- TODOS OS CAMPOS ---`);
  for (const [campo, valor] of Object.entries(item.fields).sort()) {
    const v = typeof valor === "string" && valor.length > 200 ? valor.slice(0, 200) + "…" : valor;
    console.log(`  ${campo} = ${JSON.stringify(v)}`);
  }
  const relations = item.relations ?? [];
  const filhos = relations.filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward");
  console.log(`\n--- RELATIONS (${relations.length} total, ${filhos.length} filhos "Hierarchy-Forward") ---`);
  for (const r of relations) {
    const idFilho = r.url?.split("/").pop();
    console.log(`  ${r.rel} -> #${idFilho}`);
  }
  return filhos.map((r) => r.url?.split("/").pop());
}

async function main() {
  const epic = await buscarItem(id);
  const idsFilhos = imprimirItem(epic);

  if (comFilhos && idsFilhos.length) {
    for (const filhoId of idsFilhos) {
      const filho = await buscarItem(filhoId);
      imprimirItem(filho);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

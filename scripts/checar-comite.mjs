// Diagnóstico da aba "Comitês": a tela não está trazendo nenhuma demanda, mesmo com work items no
// Azure DevOps que claramente têm a Data de Comitê preenchida (ex.: #41987 em KMM4). Esse script
// roda a MESMA WIQL usada em produção (getDemandasComite, lib/devops-client.ts) direto contra a
// API, mais uma versão sem o filtro de data, e dumpa os campos do item passado — pra achar se o
// problema é o nome de referência do campo, o tipo do item, o State, ou a própria cláusula WIQL
// "<> ''" não funcionando como esperado num campo Date.
//
// Uso: node --env-file=.env scripts/checar-comite.mjs 41987

const ORG = process.env.AZURE_DEVOPS_ORG;
const PAT = process.env.AZURE_DEVOPS_PAT;
const API_VERSION = "7.1";
const authHeader = { Authorization: "Basic " + Buffer.from(`:${PAT}`).toString("base64") };

const CAMPO_DATA_COMITE = "Custom.443622e0-6ab8-4ae5-9371-612b44a8fb1d";

const idAlvo = Number(process.argv[2]);

if (!ORG || !PAT) {
  console.error("Defina AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no .env antes de rodar este script.");
  process.exit(1);
}
if (!idAlvo) {
  console.error("Uso: node --env-file=.env scripts/checar-comite.mjs <id>");
  process.exit(1);
}

async function buscarItem(id) {
  const url = `https://dev.azure.com/${ORG}/_apis/wit/workitems/${id}?api-version=${API_VERSION}`;
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar item ${id}: ${await res.text()}`);
  return res.json();
}

async function rodarWiql(project, wiql) {
  const base = `https://dev.azure.com/${ORG}/${encodeURIComponent(project)}/_apis`;
  const res = await fetch(`${base}/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ query: wiql }),
  });
  if (!res.ok) {
    console.log(`  ❌ HTTP ${res.status}: ${await res.text()}`);
    return null;
  }
  const { workItems } = await res.json();
  return workItems.map((w) => w.id);
}

async function main() {
  console.log(`\n=== 1) Campos do item #${idAlvo} (dump completo) ===`);
  const item = await buscarItem(idAlvo);
  console.log(`Título: ${item.fields["System.Title"]}`);
  console.log(`Tipo (System.WorkItemType): ${item.fields["System.WorkItemType"]}`);
  console.log(`Projeto (System.TeamProject): ${item.fields["System.TeamProject"]}`);
  console.log(`State: ${item.fields["System.State"]}`);
  console.log(`Area Path: ${item.fields["System.AreaPath"]}`);
  console.log(`\nCampo esperado (${CAMPO_DATA_COMITE}) = ${JSON.stringify(item.fields[CAMPO_DATA_COMITE])}`);
  console.log(`\n--- Todos os campos "Custom.*" do item (confirmar se o nome de referência acima é o certo) ---`);
  for (const [campo, valor] of Object.entries(item.fields).sort()) {
    if (campo.startsWith("Custom.")) {
      console.log(`  ${campo} = ${JSON.stringify(valor)}`);
    }
  }

  const project = item.fields["System.TeamProject"];

  console.log(`\n=== 2) WIQL EXATA usada em produção (getDemandasComite), rodando em "${project}" ===`);
  const wiqlProducao = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = '${project}'
      AND [System.WorkItemType] = 'Product Backlog Item'
      AND [System.State] NOT IN ('Removed')
      AND [${CAMPO_DATA_COMITE}] <> ''
    ORDER BY [${CAMPO_DATA_COMITE}] ASC
  `;
  const idsProducao = await rodarWiql(project, wiqlProducao);
  if (idsProducao) {
    console.log(`Total encontrado: ${idsProducao.length}`);
    console.log(`#${idAlvo} está no resultado? ${idsProducao.includes(idAlvo) ? "SIM" : "NÃO"}`);
  }

  console.log(`\n=== 3) Mesma WIQL, mas SEM o filtro de Data de Comitê (só tipo + state) ===`);
  const wiqlSemData = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = '${project}'
      AND [System.WorkItemType] = 'Product Backlog Item'
      AND [System.State] NOT IN ('Removed')
  `;
  const idsSemData = await rodarWiql(project, wiqlSemData);
  if (idsSemData) {
    console.log(`Total encontrado: ${idsSemData.length}`);
    console.log(`#${idAlvo} está no resultado? ${idsSemData.includes(idAlvo) ? "SIM" : "NÃO"}`);
  }

  console.log(`\n=== 4) Mesma WIQL de novo, mas testando "[campo] <> ''" só (sem tipo/state), pra isolar a cláusula do campo de data ===`);
  const wiqlSoData = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = '${project}'
      AND [${CAMPO_DATA_COMITE}] <> ''
  `;
  const idsSoData = await rodarWiql(project, wiqlSoData);
  if (idsSoData) {
    console.log(`Total encontrado: ${idsSoData.length}`);
    console.log(`#${idAlvo} está no resultado? ${idsSoData.includes(idAlvo) ? "SIM" : "NÃO"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

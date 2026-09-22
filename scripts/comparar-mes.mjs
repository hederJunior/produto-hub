// Diagnóstico: lista os PBIs que a captura do Produto Hub considera "abertos" e "encerrados/
// cancelados" num mês específico, pra comparar linha a linha com uma exportação manual do Azure
// DevOps (ex.: quando os números do painel não batem com uma lista que o Heder já tem em mãos).
//
// Reproduz EXATAMENTE a mesma WIQL e a mesma classificação de estado que a captura de produção
// usa (lib/devops-client.ts + lib/demandas-agregacao.ts), incluindo os dois produtos (KMM4/KMM5).
// Mostra a data de criação/fechamento tanto em UTC (o que o sistema usa hoje pra decidir o mês)
// quanto convertida pra horário de Brasília (UTC-3) — se um item aparecer num mês em UTC e no mês
// anterior/seguinte em BRT, é o item criado perto da meia-noite que pode estar puxando a
// contagem pro mês errado.
//
// Uso: node --env-file=.env scripts/comparar-mes.mjs 2026-09

const ORG = process.env.AZURE_DEVOPS_ORG;
const PAT = process.env.AZURE_DEVOPS_PAT;
const API_VERSION = "7.1";
const authHeader = { Authorization: "Basic " + Buffer.from(`:${PAT}`).toString("base64") };

if (!ORG || !PAT) {
  console.error("Defina AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no .env antes de rodar este script.");
  process.exit(1);
}

const mesAlvo = process.argv[2] ?? new Date().toISOString().slice(0, 7);
if (!/^\d{4}-\d{2}$/.test(mesAlvo)) {
  console.error(`Mês inválido: "${mesAlvo}". Use o formato YYYY-MM, ex.: 2026-09`);
  process.exit(1);
}

// Mantido em sync manualmente com lib/devops-projetos.ts.
const DEVOPS_PROJETOS = {
  KMM4: { project: "KMM4", areaPaths: ["KMM4\\TMS - Rangers", "KMM4\\TMS - BeeSharp", "KMM4\\TMS - Debitos Tecnicos", "KMM4\\TMS - Melhorias", "KMM4\\TMS - DreamTeam", "KMM4\\TMS - Roadmap", "KMM4\\TMS - EDI e Fast Track"] },
  KMM5: { project: "KMM5", areaPaths: ["KMM5\\TMS - Dedicada Maroni", "KMM5\\TMS - Dedicada Transben", "KMM5\\TMS - Ecossistema", "KMM5\\TMS - Melhorias", "KMM5\\TMS - Migracao", "KMM5\\TMS - Obrigacoes Legais e Financeiras", "KMM5\\TMS - Projetos de Implantacao", "KMM5\\TMS - Serviços da Carteira"] },
};

const CAMPOS = ["System.Title", "System.State", "System.AreaPath", "System.CreatedDate", "Custom.Cliente", "Microsoft.VSTS.Common.ClosedDate"];

// Cópia fiel de lib/demandas-agregacao.ts — PROVISÓRIO, mesma heurística usada em produção.
function classificarEncerramento(state) {
  const s = (state ?? "").toLowerCase();
  if (!s) return null;
  if (/cancel|remov|negad|rejeit/.test(s)) return "cancelada";
  if (/closed|conclu|encerrad|finaliz|^done$/.test(s)) return "encerrada";
  return null;
}

function mesUTC(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function paraBRT(iso) {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} BRT`;
}
function mesBRT(iso) {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function buscarProduto(produto, project, areaPaths) {
  const base = `https://dev.azure.com/${ORG}/${encodeURIComponent(project)}/_apis`;
  const clausulaAreaPaths = "(" + areaPaths.map((ap) => `[System.AreaPath] UNDER '${ap}'`).join(" OR ") + ")";
  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = '${project}'
      AND ${clausulaAreaPaths}
      AND [System.WorkItemType] = 'Product Backlog Item'
    ORDER BY [System.Id]
  `;

  const wiqlRes = await fetch(`${base}/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ query: wiql }),
  });
  if (!wiqlRes.ok) throw new Error(`HTTP ${wiqlRes.status} na WIQL de "${project}": ${await wiqlRes.text()}`);

  const { workItems } = await wiqlRes.json();
  const ids = workItems.map((w) => w.id);
  if (!ids.length) return [];

  const itens = [];
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const res = await fetch(`${base}/wit/workitemsbatch?api-version=${API_VERSION}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ ids: lote, fields: CAMPOS }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} no lote de "${project}": ${await res.text()}`);
    const { value } = await res.json();
    itens.push(...value.map((item) => ({ ...item, produto })));
  }
  return itens;
}

console.log(`\nComparando mês ${mesAlvo} (mesma WIQL/campos da captura de produção, KMM4 + KMM5)\n`);

const todos = (
  await Promise.all(Object.entries(DEVOPS_PROJETOS).map(([produto, { project, areaPaths }]) => buscarProduto(produto, project, areaPaths)))
).flat();

const abertasUTC = todos.filter((i) => mesUTC(i.fields["System.CreatedDate"]) === mesAlvo);
const abertasBRT = todos.filter((i) => mesBRT(i.fields["System.CreatedDate"]) === mesAlvo);

console.log(`=== ABERTAS em ${mesAlvo} (por System.CreatedDate) ===`);
console.log(`Contagem em UTC (o que o sistema usa hoje): ${abertasUTC.length}`);
console.log(`Contagem em BRT (UTC-3, horário de Brasília): ${abertasBRT.length}`);
if (abertasUTC.length !== abertasBRT.length) {
  console.log("⚠️  Divergem — tem item(ns) criado(s) perto da meia-noite mudando de mês conforme o fuso.\n");
}
console.log("");
for (const item of abertasUTC.sort((a, b) => a.id - b.id)) {
  const cliente = item.fields["Custom.Cliente"] ?? "";
  console.log(
    `#${item.id}  [${item.produto}]  ${String(item.fields["System.Title"]).slice(0, 60).padEnd(60)}  cliente=${String(cliente).padEnd(20)}  state=${item.fields["System.State"]}  created(UTC)=${item.fields["System.CreatedDate"]}  created(BRT)=${paraBRT(item.fields["System.CreatedDate"])}`
  );
}

console.log(`\n=== ENCERRADAS/CANCELADAS em ${mesAlvo} (por Microsoft.VSTS.Common.ClosedDate + classificarEncerramento) ===`);
const fechadas = todos.filter((i) => {
  const cat = classificarEncerramento(i.fields["System.State"]);
  const closed = i.fields["Microsoft.VSTS.Common.ClosedDate"];
  return cat && closed && mesUTC(closed) === mesAlvo;
});
const encerradas = fechadas.filter((i) => classificarEncerramento(i.fields["System.State"]) === "encerrada");
const canceladas = fechadas.filter((i) => classificarEncerramento(i.fields["System.State"]) === "cancelada");
console.log(`Encerradas: ${encerradas.length} | Canceladas: ${canceladas.length} | Total: ${fechadas.length}`);
console.log("");
for (const item of fechadas.sort((a, b) => a.id - b.id)) {
  const cliente = item.fields["Custom.Cliente"] ?? "";
  const cat = classificarEncerramento(item.fields["System.State"]);
  console.log(
    `#${item.id}  [${item.produto}]  [${cat}]  ${String(item.fields["System.Title"]).slice(0, 55).padEnd(55)}  cliente=${String(cliente).padEnd(20)}  state=${item.fields["System.State"]}  closed(UTC)=${item.fields["Microsoft.VSTS.Common.ClosedDate"]}`
  );
}

// Estados que existem no período mas NÃO bateram em nenhuma categoria — ajuda a achar buracos
// na heurística de classificarEncerramento (estados de fechamento que ela ainda não reconhece).
const estadosNaoClassificados = new Set(
  todos
    .filter((i) => i.fields["Microsoft.VSTS.Common.ClosedDate"] && mesUTC(i.fields["Microsoft.VSTS.Common.ClosedDate"]) === mesAlvo)
    .filter((i) => !classificarEncerramento(i.fields["System.State"]))
    .map((i) => i.fields["System.State"])
);
if (estadosNaoClassificados.size) {
  console.log(`\n⚠️  Itens com ClosedDate em ${mesAlvo} mas com State que a heurística NÃO reconhece como encerrado/cancelado:`);
  console.log([...estadosNaoClassificados].join(", "));
}

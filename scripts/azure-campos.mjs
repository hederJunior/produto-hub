// T01 do Fluxo do PO — descoberta SOMENTE LEITURA do que existe no Azure DevOps (KMM5).
// Não grava nada. Serve para confirmar os reference names antes de escrever lib/fluxo-po-campos.ts:
//   1. todos os campos do PBI (reference name, nome, tipo) + valores permitidos de Etapa e Classificação;
//   2. o tipo de work item "Assesment" (nome real) e seus campos, incluindo Data Comitê;
//   3. a relação PBI <-> Assesment (pai/filho) em itens reais;
//   4. a árvore de Area Path (raiz KMM5 e esteiras filhas).
//
// Uso (a máquina corporativa precisa de --use-system-ca):
//   node --use-system-ca --env-file=.env scripts/azure-campos.mjs [PROJETO]
// PROJETO é opcional (padrão KMM5).

const ORG = process.env.AZURE_DEVOPS_ORG;
const PAT = process.env.AZURE_DEVOPS_PAT;
const API = "7.1";
const PROJETO = process.argv[2] || "KMM5";
const TIPO_PBI = "Product Backlog Item";

if (!ORG || !PAT) {
  console.error("Defina AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no .env antes de rodar este script.");
  process.exit(1);
}

const auth = { Authorization: "Basic " + Buffer.from(`:${PAT}`).toString("base64") };
const base = `https://dev.azure.com/${ORG}/${encodeURIComponent(PROJETO)}/_apis`;

async function get(url) {
  const res = await fetch(url, { headers: auth });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url.replace(PAT, "***")}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function wiql(query, top) {
  const res = await fetch(`${base}/wit/wiql?${top ? `$top=${top}&` : ""}api-version=${API}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} na WIQL: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const titulo = (t) => console.log(`\n${"=".repeat(8)} ${t} ${"=".repeat(8)}`);
const aspas = (s) => String(s).replace(/'/g, "''");

// Tipos de todos os campos do org (o endpoint por tipo de work item não traz o tipo do dado).
async function tiposDeCampo() {
  const { value } = await get(`https://dev.azure.com/${ORG}/_apis/wit/fields?api-version=${API}`);
  return new Map(value.map((f) => [f.referenceName, f.type]));
}

// Campos de um tipo de work item, com valores permitidos.
async function camposDoTipo(tipo) {
  const url = `${base}/wit/workitemtypes/${encodeURIComponent(tipo)}/fields?$expand=allowedValues&api-version=${API}`;
  return (await get(url)).value;
}

function imprimirCampos(campos, tipos, destacar) {
  const ordenados = [...campos].sort((a, b) => a.referenceName.localeCompare(b.referenceName));
  for (const c of ordenados) {
    const marca = destacar(c) ? " <<<" : "";
    console.log(`${c.referenceName.padEnd(58)} | ${String(c.name).padEnd(34)} | ${tipos.get(c.referenceName) ?? "?"}${marca}`);
  }
}

async function main() {
  console.log(`Org: ${ORG} | Projeto: ${PROJETO}`);
  const tipos = await tiposDeCampo();

  // ---------- 1. Campos do PBI ----------
  titulo(`1. Campos do "${TIPO_PBI}" (${PROJETO})`);
  const camposPbi = await camposDoTipo(TIPO_PBI);
  console.log(`${camposPbi.length} campos. Linhas marcadas com <<< são as candidatas do Fluxo do PO.\n`);
  console.log(`${"reference name".padEnd(58)} | ${"nome".padEnd(34)} | tipo`);
  const interesse = /etapa|classifica|cliente|comit|abertura|^custom\.po$|tags|areapath|state|priority|description|effort|iteration/i;
  imprimirCampos(camposPbi, tipos, (c) => interesse.test(c.referenceName) || interesse.test(c.name));

  const achar = (re) => camposPbi.filter((c) => re.test(c.name) || re.test(c.referenceName));
  const listarPermitidos = (rotulo, re) => {
    titulo(`Valores permitidos — ${rotulo}`);
    const lista = achar(re);
    if (!lista.length) console.log("(nenhum campo encontrado com esse nome)");
    for (const c of lista) {
      const permitidos = c.allowedValues ?? [];
      console.log(`${c.referenceName} ("${c.name}", ${tipos.get(c.referenceName) ?? "?"}) — ${permitidos.length} valores:`);
      permitidos.forEach((v) => console.log(`   - ${typeof v === "string" ? v : JSON.stringify(v)}`));
    }
  };
  listarPermitidos("Etapa", /etapa/i);
  listarPermitidos("Classificação", /classifica/i);
  listarPermitidos("State (Status)", /^System\.State$/i);

  titulo("Campos candidatos por assunto (todos os que casam)");
  for (const [rotulo, re] of [
    ["Cliente", /cliente/i],
    ["PO", /^Custom\.PO$|\bPO\b/],
    ["Data Abertura Produto", /abertura/i],
    ["Data Comitê", /comit/i],
    ["Tags", /System\.Tags/i],
    ["Descrição", /System\.Description/i],
  ]) {
    const lista = achar(re);
    console.log(`${rotulo}: ${lista.length ? lista.map((c) => `${c.referenceName} ("${c.name}")`).join(" ; ") : "(não encontrado)"}`);
  }

  // ---------- 2. Tipo Assesment ----------
  titulo("2. Tipos de work item do projeto");
  const { value: tiposWi } = await get(`${base}/wit/workitemtypes?api-version=${API}`);
  console.log(tiposWi.map((t) => t.name).join(" | "));
  const assesment = tiposWi.filter((t) => /assess|assesm/i.test(t.name));
  if (!assesment.length) console.log('\n(nenhum tipo com nome parecido com "Assesment")');
  for (const t of assesment) {
    titulo(`Campos do tipo "${t.name}"`);
    console.log(`${"reference name".padEnd(58)} | ${"nome".padEnd(34)} | tipo`);
    imprimirCampos(await camposDoTipo(t.name), tipos, (c) => /comit/i.test(c.referenceName) || /comit/i.test(c.name));
  }

  // ---------- 3. Relação PBI <-> Assesment ----------
  titulo("3. Relação PBI <-> Assesment");
  for (const t of assesment) {
    for (const [rotulo, origem, destino] of [
      [`PBI é pai de ${t.name} (Hierarchy-Forward)`, TIPO_PBI, t.name],
      [`${t.name} é pai de PBI (Hierarchy-Forward)`, t.name, TIPO_PBI],
    ]) {
      const q = `SELECT [System.Id] FROM WorkItemLinks WHERE [Source].[System.TeamProject] = '${aspas(PROJETO)}' AND [Source].[System.WorkItemType] = '${aspas(origem)}' AND [Target].[System.WorkItemType] = '${aspas(destino)}' AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' MODE (MustContain)`;
      try {
        const r = await wiql(q, 200);
        const rels = r.workItemRelations ?? [];
        console.log(`${rotulo}: ${rels.length} relações (limite 200)`);
        for (const rel of rels.slice(0, 5)) console.log(`   ${rel.source?.id ?? "-"} -> ${rel.target?.id}`);
      } catch (e) {
        console.log(`${rotulo}: erro — ${e.message}`);
      }
    }
    // Um PBI real com filho Assesment: mostra o item com relações e os campos de Data Comitê dos dois lados.
    try {
      const q = `SELECT [System.Id] FROM WorkItemLinks WHERE [Source].[System.TeamProject] = '${aspas(PROJETO)}' AND [Source].[System.WorkItemType] = '${TIPO_PBI}' AND [Target].[System.WorkItemType] = '${aspas(t.name)}' AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' MODE (MustContain)`;
      const rels = ((await wiql(q, 5)).workItemRelations ?? []).filter((r) => r.source);
      if (rels[0]) {
        const pai = await get(`${base}/wit/workitems/${rels[0].source.id}?$expand=relations&api-version=${API}`);
        console.log(`\nExemplo — PBI ${pai.id}: relações:`);
        for (const r of pai.relations ?? []) console.log(`   ${r.rel} -> ${r.url.split("/").pop()} (${r.attributes?.name ?? ""})`);
        const filho = await get(`${base}/wit/workitems/${rels[0].target.id}?api-version=${API}`);
        const dc = Object.keys(filho.fields).filter((k) => /comit/i.test(k));
        console.log(`Exemplo — ${t.name} ${filho.id} (estado ${filho.fields["System.State"]}); campos de Comitê preenchidos: ${dc.length ? dc.map((k) => `${k}=${filho.fields[k]}`).join(", ") : "(nenhum preenchido)"}`);
      } else {
        console.log("\n(nenhum PBI com filho desse tipo no projeto)");
      }
    } catch (e) {
      console.log(`Exemplo: erro — ${e.message}`);
    }
  }

  // ---------- 4. Area Path ----------
  titulo(`4. Árvore de Area Path (${PROJETO})`);
  const raiz = await get(`${base}/wit/classificationnodes/areas?$depth=4&api-version=${API}`);
  const imprimir = (no, nivel, caminho) => {
    const atual = nivel === 0 ? no.name : `${caminho}\\${no.name}`;
    console.log(`${"  ".repeat(nivel)}${no.name}   [${atual}]`);
    (no.children ?? []).forEach((f) => imprimir(f, nivel + 1, atual));
  };
  imprimir(raiz, 0, "");

  console.log("\nFim. Nada foi gravado.");
}

main().catch((e) => {
  console.error("\nERRO:", e.message);
  process.exit(1);
});

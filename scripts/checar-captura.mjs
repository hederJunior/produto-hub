// Diagnóstico: dado um ou mais termos de busca (trecho do título), busca o(s) work item(ns)
// correspondente(s) direto na Azure DevOps (KMM4 + KMM5, sem filtro de Area Path nem de State —
// pra não esconder nada) e cruza com o que está gravado hoje em DemandaAtual no Supabase.
//
// Serve pra responder, item por item: (a) o item existe e qual o AreaPath/State/Cliente reais
// na Azure DevOps agora; (b) esse item já foi capturado (existe linha em DemandaAtual)? (c) se
// existe, os valores gravados batem com os da Azure DevOps agora, ou estão desatualizados
// (captura antiga, antes de uma mudança de estado/cliente)?
//
// Uso: node --env-file=.env scripts/checar-captura.mjs "Contra CT-e" "checklist"
//   (cada argumento é um termo de busca por CONTAINS no título; roda pros dois produtos)

import { createClient } from "@supabase/supabase-js";

const ORG = process.env.AZURE_DEVOPS_ORG;
const PAT = process.env.AZURE_DEVOPS_PAT;
const API_VERSION = "7.1";
const authHeader = { Authorization: "Basic " + Buffer.from(`:${PAT}`).toString("base64") };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ORG || !PAT) {
  console.error("Defina AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no .env antes de rodar este script.");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env antes de rodar este script.");
  process.exit(1);
}

const termos = process.argv.slice(2);
if (!termos.length) {
  console.error('Passe pelo menos um termo de busca, ex.: node --env-file=.env scripts/checar-captura.mjs "Contra CT-e"');
  process.exit(1);
}

const DEVOPS_PROJETOS = {
  KMM4: { project: "KMM4", areaPaths: ["KMM4\\TMS - Rangers", "KMM4\\TMS - BeeSharp", "KMM4\\TMS - Debitos Tecnicos", "KMM4\\TMS - Melhorias", "KMM4\\TMS - DreamTeam", "KMM4\\TMS - Roadmap", "KMM4\\TMS - EDI e Fast Track"] },
  KMM5: { project: "KMM5", areaPaths: ["KMM5\\TMS - Dedicada Maroni", "KMM5\\TMS - Dedicada Transben", "KMM5\\TMS - Ecossistema", "KMM5\\TMS - Melhorias", "KMM5\\TMS - Migracao", "KMM5\\TMS - Obrigacoes Legais e Financeiras", "KMM5\\TMS - Projetos de Implantacao", "KMM5\\TMS - Serviços da Carteira"] },
};

const CAMPOS = ["System.Title", "System.State", "System.AreaPath", "System.CreatedDate", "Custom.Cliente", "Microsoft.VSTS.Common.ClosedDate"];

function areaPathEmEscopo(areaPath, areaPaths) {
  return areaPaths.some((ap) => areaPath === ap || areaPath.startsWith(ap + "\\"));
}

async function buscarPorTermo(project, termo) {
  const wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.TeamProject] = '${project}'
      AND [System.WorkItemType] = 'Product Backlog Item'
      AND [System.Title] CONTAINS '${termo.replace(/'/g, "''")}'
    ORDER BY [System.Id]
  `;
  const res = await fetch(`https://dev.azure.com/${ORG}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ query: wiql }),
  });
  if (!res.ok) {
    console.error(`  [${project}] Falha na busca WIQL (${res.status}): ${await res.text()}`);
    return [];
  }
  const { workItems } = await res.json();
  const ids = workItems.map((w) => w.id);
  if (!ids.length) return [];

  const detRes = await fetch(`https://dev.azure.com/${ORG}/${encodeURIComponent(project)}/_apis/wit/workitemsbatch?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ ids, fields: CAMPOS }),
  });
  if (!detRes.ok) {
    console.error(`  [${project}] Falha ao buscar detalhes (${detRes.status}): ${await detRes.text()}`);
    return [];
  }
  const { value } = await detRes.json();
  return value;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const termo of termos) {
    console.log(`\n=== Termo: "${termo}" ===`);
    for (const produto of Object.keys(DEVOPS_PROJETOS)) {
      const { project, areaPaths } = DEVOPS_PROJETOS[produto];
      const itens = await buscarPorTermo(project, termo);
      if (!itens.length) continue;

      for (const item of itens) {
        const f = item.fields;
        const areaPath = String(f["System.AreaPath"] ?? "");
        const emEscopo = areaPathEmEscopo(areaPath, areaPaths);
        console.log(`\n[${produto}] #${item.id} — "${f["System.Title"]}"`);
        console.log(`  AreaPath (Azure DevOps agora): ${areaPath}  ${emEscopo ? "(DENTRO do escopo configurado)" : "(FORA do escopo configurado — não é capturado por design)"}`);
        console.log(`  State: ${f["System.State"]}`);
        console.log(`  Cliente: ${f["Custom.Cliente"] ?? "(vazio)"}`);
        console.log(`  Created Date: ${f["System.CreatedDate"]}`);
        console.log(`  Closed Date: ${f["Microsoft.VSTS.Common.ClosedDate"] ?? "(vazio)"}`);

        const { data, error } = await supabase.from("DemandaAtual").select("*").eq("workItemId", item.id).maybeSingle();
        if (error) {
          console.log(`  DemandaAtual (Supabase): ERRO na consulta — ${error.message}`);
        } else if (!data) {
          console.log(`  DemandaAtual (Supabase): NÃO ENCONTRADO — item nunca foi capturado (ou foi capturado sob outro produto).`);
        } else {
          console.log(`  DemandaAtual (Supabase): encontrado — produto=${data.produto}, state=${data.state}, cliente=${data.cliente ?? "(vazio)"}, squad=${data.squad}, createdDate=${data.createdDate}, atualizadoEm=${data.atualizadoEm}`);
          const desatualizado = data.state !== f["System.State"] || (data.cliente ?? null) !== (f["Custom.Cliente"] ?? null);
          if (desatualizado) {
            console.log(`  >>> ATENÇÃO: dados gravados DIVERGEM da Azure DevOps agora — captura desatualizada, precisa rodar o JOB de novo.`);
          }
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

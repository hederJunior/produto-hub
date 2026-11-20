// T02 do Fluxo do PO — testa se o PAT consegue ESCREVER em work items e comentários, só no PBI de teste informado.
//
// O que faz (e desfaz tudo ao final, mesmo se um passo falhar):
//   1. lê o PBI (recusa se não for "Product Backlog Item" do KMM5) e guarda as tags originais;
//   2. adiciona a tag "teste-fluxo-po" (PATCH com teste de revisão), confere e restaura as tags originais;
//   3. cria um comentário, confere que ele aparece e apaga o comentário.
// Não cria work items, não mexe em nenhum outro campo e não toca em outro PBI.
//
// Uso: node --use-system-ca --env-file=.env scripts/azure-testar-escrita.mjs <ID_DO_PBI_DE_TESTE>

const ORG = process.env.AZURE_DEVOPS_ORG;
const PAT = process.env.AZURE_DEVOPS_PAT;
const API = "7.1";
const API_COMENTARIOS = "7.1-preview.4";
const PROJETO = "KMM5";
const TAG_TESTE = "teste-fluxo-po";
const id = Number(process.argv[2]);

if (!ORG || !PAT) {
  console.error("Defina AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT no .env antes de rodar este script.");
  process.exit(1);
}
if (!Number.isInteger(id) || id <= 0) {
  console.error("Informe o ID do PBI de teste: node --use-system-ca --env-file=.env scripts/azure-testar-escrita.mjs <ID>");
  process.exit(1);
}

const auth = { Authorization: "Basic " + Buffer.from(`:${PAT}`).toString("base64") };
const base = `https://dev.azure.com/${ORG}/${encodeURIComponent(PROJETO)}/_apis`;
const resultados = [];
const registrar = (passo, ok, detalhe = "") => {
  resultados.push({ passo, ok });
  console.log(`${ok ? "OK    " : "FALHOU"} ${passo}${detalhe ? ` — ${detalhe}` : ""}`);
};

async function chamar(metodo, url, corpo, contentType = "application/json") {
  const res = await fetch(url, {
    method: metodo,
    headers: { ...auth, ...(corpo !== undefined ? { "Content-Type": contentType } : {}) },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo não-JSON */ }
  return { ok: res.ok, status: res.status, json, texto };
}

const lerItem = () => chamar("GET", `${base}/wit/workitems/${id}?api-version=${API}`);
const patch = (ops) => chamar("PATCH", `${base}/wit/workitems/${id}?api-version=${API}`, ops, "application/json-patch+json");
const msgErro = (r) => `HTTP ${r.status}: ${(r.json?.message ?? r.texto).slice(0, 250)}`;

async function main() {
  console.log(`Org: ${ORG} | Projeto: ${PROJETO} | PBI de teste: ${id}\n`);

  // ---- 1. Leitura e salvaguardas ----
  const lido = await lerItem();
  if (!lido.ok) {
    registrar("Ler o PBI de teste", false, msgErro(lido));
    return;
  }
  const f = lido.json.fields;
  console.log(`Título: ${f["System.Title"]}\nTipo: ${f["System.WorkItemType"]} | Projeto: ${f["System.TeamProject"]} | Status: ${f["System.State"]} | Etapa: ${f["Custom.Etapa"] ?? "-"}\nArea: ${f["System.AreaPath"]} | Tags: ${f["System.Tags"] ?? "(vazio)"} | Rev: ${lido.json.rev}\n`);
  if (f["System.WorkItemType"] !== "Product Backlog Item" || f["System.TeamProject"] !== PROJETO) {
    registrar("Salvaguarda (PBI do KMM5)", false, "o item informado não é um Product Backlog Item do KMM5 — nada foi gravado");
    return;
  }
  registrar("Ler o PBI de teste", true, `rev ${lido.json.rev}`);

  // ---- 2. Escrita de campo: tag de teste, com reversão garantida ----
  const tagsOriginais = f["System.Tags"]; // string "a; b" ou undefined
  const novaTags = tagsOriginais ? `${tagsOriginais}; ${TAG_TESTE}` : TAG_TESTE;
  let tagGravada = false;
  try {
    const r = await patch([
      { op: "test", path: "/rev", value: lido.json.rev },
      { op: "add", path: "/fields/System.Tags", value: novaTags },
    ]);
    if (!r.ok) {
      registrar("Gravar tag de teste (PATCH)", false, msgErro(r));
    } else {
      tagGravada = true;
      registrar("Gravar tag de teste (PATCH)", true, `rev ${r.json.rev}`);
      const conferido = (await lerItem()).json?.fields?.["System.Tags"] ?? "";
      registrar("Conferir que a tag apareceu", conferido.split(";").map((t) => t.trim()).includes(TAG_TESTE), `Tags agora: ${conferido}`);
    }
  } finally {
    if (tagGravada) {
      const atual = await lerItem();
      const op = tagsOriginais ? { op: "replace", path: "/fields/System.Tags", value: tagsOriginais } : { op: "remove", path: "/fields/System.Tags" };
      const r = await patch([{ op: "test", path: "/rev", value: atual.json.rev }, op]);
      if (!r.ok) {
        registrar("Restaurar as tags originais", false, `${msgErro(r)} — REMOVA A TAG "${TAG_TESTE}" DO PBI ${id} MANUALMENTE`);
      } else {
        const final = (await lerItem()).json?.fields?.["System.Tags"];
        registrar("Restaurar as tags originais", (final ?? "") === (tagsOriginais ?? ""), `Tags agora: ${final ?? "(vazio)"}`);
      }
    }
  }

  // ---- 3. Comentário: cria, confere e apaga ----
  const urlComentarios = `${base}/wit/workItems/${id}/comments`;
  let comentarioId = null;
  try {
    const texto = `[teste automático do Fluxo do PO — ${new Date().toISOString()}] Este comentário é apagado em seguida.`;
    const r = await chamar("POST", `${urlComentarios}?api-version=${API_COMENTARIOS}`, { text: texto });
    if (!r.ok) {
      registrar("Criar comentário", false, msgErro(r));
    } else {
      comentarioId = r.json.id;
      registrar("Criar comentário", true, `id ${comentarioId}, autor "${r.json.createdBy?.displayName ?? "?"}"`);
      const lista = await chamar("GET", `${urlComentarios}?$top=5&order=desc&api-version=${API_COMENTARIOS}`);
      registrar("Conferir que o comentário aparece", !!lista.json?.comments?.some((c) => c.id === comentarioId));
    }
  } finally {
    if (comentarioId !== null) {
      const r = await chamar("DELETE", `${urlComentarios}/${comentarioId}?api-version=${API_COMENTARIOS}`);
      if (!r.ok) {
        registrar("Apagar o comentário de teste", false, `${msgErro(r)} — APAGUE O COMENTÁRIO ${comentarioId} DO PBI ${id} MANUALMENTE`);
      } else {
        const lista = await chamar("GET", `${urlComentarios}?$top=5&order=desc&api-version=${API_COMENTARIOS}`);
        registrar("Apagar o comentário de teste", !lista.json?.comments?.some((c) => c.id === comentarioId));
      }
    }
  }
}

main()
  .catch((e) => {
    registrar("Execução do script", false, e.message);
  })
  .finally(() => {
    const falhas = resultados.filter((r) => !r.ok);
    console.log(`\nResumo: ${resultados.length - falhas.length} OK, ${falhas.length} com falha.`);
    console.log(falhas.length ? "O PAT NÃO está confirmado para escrita (ou há ajuste a fazer): veja os passos que falharam." : "PAT com escrita em campos e comentários CONFIRMADO neste PBI.");
    process.exit(falhas.length ? 1 : 0);
  });

// Fluxo do PO, etapa 2.1 — valida o botão "Necessário análise tech" (tag "Pronto para refinamento tech") no PBI DE TESTE.
// Roda as MESMAS funções da rota GET/POST /api/fluxo-po/pbi/{id}/tag-tech (sem a camada de login). Ao final devolve as Tags (e a Etapa, se o
// script a mudou) ao valor original e apaga as linhas de log do teste, mesmo se um passo falhar.
// Passos sem gravar: leitura do estado, sem permissão (403) e card fora da 2.1 (422). Passos gravando (PBI na 2.1; com PREPARAR_2_1=1 o script
// põe o PBI de teste na 2.1 durante o teste): aplicar a tag mantendo as outras e repetir (não grava de novo, avisa).
//
// Só aceita o PBI de teste 46766.
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-testar-tag-tech.mjs 46766
import { ErroFluxoPo, aplicarPatchPbi, lerPbiFluxoPoAtual } from "../lib/fluxo-po-servidor.ts";
import { lerTagTech, marcarNecessarioAnaliseTech } from "../lib/fluxo-po-tag-tech-servidor.ts";
import { derivarEtapa, temTag } from "../lib/fluxo-po.ts";
import { CAMPOS_PBI, ETAPA, TAG_PRONTO_REFINAMENTO_TECH } from "../lib/fluxo-po-campos.ts";
import { getServiceClient } from "../lib/supabase.ts";

const PBI_DE_TESTE = 46766;
const id = Number(process.argv[2]);
if (id !== PBI_DE_TESTE) {
  console.error(`Recusado: este script só grava no PBI de teste ${PBI_DE_TESTE}. Uso: ... scripts/azure-testar-tag-tech.mjs ${PBI_DE_TESTE}`);
  process.exit(1);
}

const admin = { email: "script-teste-tag@local", nome: "Script de teste (tag)", tipo: "adm", papel: null };
const cs = { email: "visitante-tag@local", nome: "Visitante", tipo: "user", papel: "CS" };
const USUARIOS = [admin.email, cs.email];
const INICIO = new Date(Date.now() - 30_000).toISOString();
const resultados = [];
const registrar = (passo, ok, detalhe = "") => {
  resultados.push({ passo, ok });
  console.log(`${ok ? "OK    " : "FALHOU"} ${passo}${detalhe ? ` — ${detalhe}` : ""}`);
};
async function esperarErro(passo, status, fn) {
  try {
    await fn();
    registrar(passo, false, "deveria ter falhado");
  } catch (e) {
    registrar(passo, e instanceof ErroFluxoPo && e.status === status, e instanceof ErroFluxoPo ? `${e.status} ${e.codigo}` : String(e));
  }
}
const aplicarCampos = async (campos) => {
  const agora = await lerPbiFluxoPoAtual(id);
  await aplicarPatchPbi(id, [
    { op: "test", path: "/rev", value: agora.rev },
    ...Object.entries(campos).map(([campo, valor]) => (valor === "" ? { op: "remove", path: `/fields/${campo}` } : { op: "add", path: `/fields/${campo}`, value: valor })),
  ]);
};

const inicial = await lerPbiFluxoPoAtual(id);
const tagsOriginais = inicial.tags ?? "";
const etapaOriginal = inicial.etapa ?? "";
let mudouEtapa = false;
console.log(`PBI ${id}: etapa ${derivarEtapa(inicial).etapa}, tags "${tagsOriginais}".`);

try {
  if (temTag(tagsOriginais, TAG_PRONTO_REFINAMENTO_TECH)) throw new Error("O PBI de teste já tem a tag; retire-a antes (o teste não sabe devolver esse estado).");
  registrar("Estado inicial: sem a tag", (await lerTagTech(id)).aplicada === false);
  await esperarErro("Sem permissão (CS) → 403", 403, () => marcarNecessarioAnaliseTech({ id, usuario: cs }));

  if (derivarEtapa(inicial).etapa !== "2.1" && process.env.PREPARAR_2_1 !== "1") {
    await esperarErro("Card fora da 2.1 → 422", 422, () => marcarNecessarioAnaliseTech({ id, usuario: admin }));
    console.log("O PBI não está na etapa 2.1: o passo de gravação foi PULADO (use PREPARAR_2_1=1).");
  } else {
    if (derivarEtapa(inicial).etapa !== "2.1") {
      await esperarErro("Card fora da 2.1 → 422", 422, () => marcarNecessarioAnaliseTech({ id, usuario: admin }));
      await aplicarCampos({ [CAMPOS_PBI.etapa]: ETAPA.comite });
      mudouEtapa = true;
      console.log(`Preparação: Etapa "${etapaOriginal}" → "${ETAPA.comite}" (será devolvida no fim).`);
    }
    const r = await marcarNecessarioAnaliseTech({ id, usuario: admin });
    const esperadas = tagsOriginais ? `${tagsOriginais}; ${TAG_PRONTO_REFINAMENTO_TECH}` : TAG_PRONTO_REFINAMENTO_TECH;
    registrar("Aplica a tag mantendo as outras", r.aplicada && !r.jaTinha && r.tags === esperadas, `tags agora: "${r.tags}"`);
    registrar("Leitura confirma a tag", (await lerTagTech(id)).aplicada === true);
    const r2 = await marcarNecessarioAnaliseTech({ id, usuario: admin });
    registrar("Repetir não grava de novo e avisa", r2.jaTinha === true && r2.alteracoes.length === 0 && r2.tags === r.tags);
  }

  const { data: linhas, error } = await getServiceClient().from("FluxoPoMovimento").select("direcao, resultado").eq("workItemId", id).in("usuario", USUARIOS).gte("criadoEm", INICIO);
  if (error) throw new Error(`Falha ao ler o log: ${error.message}`);
  registrar("Todas as tentativas foram para o log (direção tag)", (linhas ?? []).length > 0 && linhas.every((l) => l.direcao === "tag"), JSON.stringify((linhas ?? []).map((l) => l.resultado)));
} finally {
  try {
    await aplicarCampos({ [CAMPOS_PBI.tags]: tagsOriginais, ...(mudouEtapa ? { [CAMPOS_PBI.etapa]: etapaOriginal } : {}) });
    const final = await lerPbiFluxoPoAtual(id);
    registrar("Tags (e Etapa) do PBI de teste devolvidas ao original", (final.tags ?? "") === tagsOriginais && (!mudouEtapa || (final.etapa ?? "") === etapaOriginal), `tags "${final.tags ?? ""}", etapa "${final.etapa ?? ""}"`);
  } catch (e) {
    registrar("Tags (e Etapa) do PBI de teste devolvidas ao original", false, String(e));
  }
  const { error } = await getServiceClient().from("FluxoPoMovimento").delete().eq("workItemId", id).in("usuario", USUARIOS).gte("criadoEm", INICIO);
  registrar("Linhas de log do teste apagadas", !error, error?.message ?? "");
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} passos OK.`);
process.exit(falhas.length ? 1 : 0);

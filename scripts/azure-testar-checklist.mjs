// T10 do Fluxo do PO — valida a API do checklist (lib/fluxo-po-checklist-servidor.ts) no PBI DE TESTE.
// Roda as MESMAS funções da rota /api/fluxo-po/pbi/{id}/checklist (sem a camada de login) contra o banco real e apaga as
// linhas que criou ao final (mesmo se um passo falhar). Não escreve nada no Azure DevOps (só lê o PBI para conferir o escopo).
//
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-testar-checklist.mjs 46766
import { ErroFluxoPo } from "../lib/fluxo-po-servidor.ts";
import { lerChecklistPbi, marcarItemChecklist } from "../lib/fluxo-po-checklist-servidor.ts";
import { getServiceClient } from "../lib/supabase.ts";

const PBI_DE_TESTE = 46766;
const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
  console.error("Informe o ID do PBI de teste: ... scripts/azure-testar-checklist.mjs 46766");
  process.exit(1);
}
if (id !== PBI_DE_TESTE && process.env.FLUXO_PO_PERMITIR_OUTRO_ID !== "1") {
  console.error(`Recusado: este script só grava no PBI de teste ${PBI_DE_TESTE} (outro ID exige FLUXO_PO_PERMITIR_OUTRO_ID=1 — nunca use PBI real).`);
  process.exit(1);
}

const admin = { email: "script-teste@local", nome: "Script de teste (T10)", tipo: "adm", papel: null };
const po = { email: "po-teste@local", nome: null, tipo: "user", papel: "PO" };
const cs = { email: "visitante@local", nome: "Visitante", tipo: "user", papel: "CS" };
const resultados = [];
const registrar = (passo, ok, detalhe = "") => {
  resultados.push({ passo, ok });
  console.log(`${ok ? "OK    " : "FALHOU"} ${passo}${detalhe ? ` — ${detalhe}` : ""}`);
};
async function esperarErro(passo, status, fn) {
  try {
    await fn();
    registrar(passo, false, "deveria ter sido recusado, mas passou");
  } catch (e) {
    registrar(passo, e instanceof ErroFluxoPo && e.status === status, e instanceof ErroFluxoPo ? `HTTP ${e.status}: ${e.message}` : String(e));
  }
}
const item = async (etapa, itemId) => (await lerChecklistPbi(id))[etapa].find((i) => i.id === itemId);

async function main() {
  const supabase = getServiceClient();
  const { count: antes } = await supabase.from("FluxoPoChecklist").select("*", { count: "exact", head: true }).eq("workItemId", id);
  console.log(`PBI de teste: ${id} | linhas de checklist existentes: ${antes}\n`);
  if (antes) {
    registrar("Pré-condição: PBI de teste sem checklist gravado", false, "há linhas anteriores; limpe-as antes para não misturar com o teste");
    return;
  }

  // Leitura inicial: todas as etapas, tudo desmarcado
  const c0 = await lerChecklistPbi(id);
  registrar("Leitura inicial: 3 etapas (1.1, 1.2, 2.1), todos os itens desmarcados", Object.keys(c0).length === 3 && Object.values(c0).every((l) => l.every((i) => !i.marcado)), `1.1=${c0["1.1"].length} itens, 1.2=${c0["1.2"].length}, 2.1=${c0["2.1"].length}`);

  // Recusas (não gravam)
  await esperarErro("Sem permissão (perfil CS) → 403", 403, () => marcarItemChecklist({ id, etapa: "1.1", itemId: "entendimento-dor", marcado: true, usuario: cs }));
  await esperarErro("Item que não existe na etapa → 422", 422, () => marcarItemChecklist({ id, etapa: "1.1", itemId: "estimativa-qa", marcado: true, usuario: admin }));
  await esperarErro("Etapa sem checklist (3.1) → 422", 422, () => marcarItemChecklist({ id, etapa: "3.1", itemId: "qualquer", marcado: true, usuario: admin }));
  await esperarErro('"marcado" que não é booleano → 422', 422, () => marcarItemChecklist({ id, etapa: "1.1", itemId: "entendimento-dor", marcado: "sim", usuario: admin }));
  await esperarErro("ID inválido → 422", 422, () => marcarItemChecklist({ id: "abc", etapa: "1.1", itemId: "entendimento-dor", marcado: true, usuario: admin }));
  await esperarErro("Item de outro tipo (Assesment 24008) → 422", 422, () => marcarItemChecklist({ id: 24008, etapa: "1.1", itemId: "entendimento-dor", marcado: true, usuario: admin }));
  await esperarErro("PBI inexistente → 404", 404, () => marcarItemChecklist({ id: 999999999, etapa: "1.1", itemId: "entendimento-dor", marcado: true, usuario: admin }));
  const { count: aposRecusas } = await supabase.from("FluxoPoChecklist").select("*", { count: "exact", head: true }).eq("workItemId", id);
  registrar("Nenhuma recusa gravou linha", aposRecusas === 0, `${aposRecusas} linhas`);

  try {
    // Marcar grava quem e quando
    const t0 = Date.now();
    const r1 = await marcarItemChecklist({ id, etapa: "1.1", itemId: "entendimento-dor", marcado: true, usuario: admin });
    registrar("Marcar (admin): grava quem (nome) e quando", r1.item.marcado && r1.item.marcadoPor === "Script de teste (T10)" && Math.abs(new Date(r1.item.marcadoEm).getTime() - t0) < 15000, JSON.stringify(r1.item));
    const r2 = await marcarItemChecklist({ id, etapa: "2.1", itemId: "estimativa-qa", marcado: true, usuario: po });
    registrar("Marcar (PO sem nome no cadastro): usa o e-mail como 'quem'", r2.item.marcadoPor === "po-teste@local", r2.item.marcadoPor);

    // Todos veem: leitura reflete as marcações, em etapas diferentes
    const c1 = await lerChecklistPbi(id);
    registrar("Leitura mostra as duas marcações, só nelas", c1["1.1"][0].marcado && c1["2.1"].find((i) => i.id === "estimativa-qa").marcado && Object.values(c1).flat().filter((i) => i.marcado).length === 2);

    // Marcar de novo o mesmo item não duplica e atualiza quem/quando
    await marcarItemChecklist({ id, etapa: "1.1", itemId: "entendimento-dor", marcado: true, usuario: po });
    const { count: linhas } = await supabase.from("FluxoPoChecklist").select("*", { count: "exact", head: true }).eq("workItemId", id);
    registrar("Marcar de novo o mesmo item não duplica a linha", linhas === 2, `${linhas} linhas`);
    registrar("...e atualiza quem marcou", (await item("1.1", "entendimento-dor")).marcadoPor === "po-teste@local");

    // Desmarcar limpa quem e quando
    const r3 = await marcarItemChecklist({ id, etapa: "1.1", itemId: "entendimento-dor", marcado: false, usuario: admin });
    registrar("Desmarcar limpa quem e quando", !r3.item.marcado && r3.item.marcadoPor === null && r3.item.marcadoEm === null, JSON.stringify(r3.item));
    registrar("Desmarcar mantém uma linha só (atualiza, não apaga nem duplica)", ((await supabase.from("FluxoPoChecklist").select("*", { count: "exact", head: true }).eq("workItemId", id)).count) === 2);

    // Duas marcações simultâneas do mesmo item (corrida no índice único): as duas dão certo e fica 1 linha
    const outro = { id, etapa: "1.2", itemId: "avaliar-solicitacao-cliente", marcado: true };
    const [a, b] = await Promise.allSettled([marcarItemChecklist({ ...outro, usuario: admin }), marcarItemChecklist({ ...outro, usuario: po })]);
    const { count: linhasCorrida } = await supabase.from("FluxoPoChecklist").select("*", { count: "exact", head: true }).eq("workItemId", id).eq("etapa", "1.2").eq("itemId", "avaliar-solicitacao-cliente");
    registrar("Marcações simultâneas do mesmo item: ambas concluem e há 1 linha", a.status === "fulfilled" && b.status === "fulfilled" && linhasCorrida === 1, `${a.status}/${b.status}, ${linhasCorrida} linha(s)${a.status === "rejected" ? ` | ${a.reason?.message}` : ""}${b.status === "rejected" ? ` | ${b.reason?.message}` : ""}`);
  } finally {
    const { error } = await supabase.from("FluxoPoChecklist").delete().eq("workItemId", id);
    const { count: resto } = await supabase.from("FluxoPoChecklist").select("*", { count: "exact", head: true }).eq("workItemId", id);
    registrar("Linhas de teste removidas", !error && resto === 0, error?.message ?? "");
  }
}

main()
  .catch((e) => registrar("Execução do script", false, e instanceof ErroFluxoPo ? `${e.status} ${e.message}` : e.stack ?? String(e)))
  .finally(() => {
    const falhas = resultados.filter((r) => !r.ok);
    console.log(`\nResumo: ${resultados.length - falhas.length} OK, ${falhas.length} com falha.`);
    process.exit(falhas.length ? 1 : 0);
  });

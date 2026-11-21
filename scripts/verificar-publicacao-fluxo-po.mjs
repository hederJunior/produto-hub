// T22 do Fluxo do PO — verifica se o ambiente (o do .env) está pronto para a publicação. SOMENTE LEITURA, exceto uma linha de teste
// temporária (workItemId -1) em FluxoPoChecklist, criada e apagada na hora, para provar que a chave pública do Supabase NÃO enxerga o checklist.
// Não escreve em nenhum PBI. Para conferir a ESCRITA do PAT no Azure, rode antes o teste da T02 (scripts/azure-testar-escrita.mjs <PBI de teste>).
//
// O que confere:
//   1. variáveis de ambiente necessárias (só os NOMES; nunca imprime valores) e QUAL projeto Supabase / organização Azure o .env aponta
//      (compare com as variáveis da Vercel: precisam ser as mesmas);
//   2. migration do Fluxo do PO aplicada (tabelas FluxoPoChecklist e FluxoPoMovimento) e RLS ligado (a chave pública não lê nem grava);
//   3. Azure DevOps: o PAT lê o projeto KMM5 e todos os campos que o Fluxo do PO usa existem (Etapa, Classificação, Cliente, Data Comitê...);
//   4. cadastro de acesso: quem pode movimentar, quem está sem papel e quem está sem nome (o filtro "Meus itens" precisa do nome).
//
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/verificar-publicacao-fluxo-po.mjs

import { createClient } from "@supabase/supabase-js";
import { podeMovimentar } from "../lib/fluxo-po.ts";
import { CAMPOS_LEITURA_PBI, PROJETO_FLUXO_PO, TIPO_PBI, TIPO_ASSESMENT } from "../lib/fluxo-po-campos.ts";

const resultados = [];
const registrar = (passo, ok, detalhe = "") => {
  resultados.push({ passo, ok });
  console.log(`${ok ? "OK    " : "FALHOU"} ${passo}${detalhe ? ` — ${detalhe}` : ""}`);
};
const titulo = (t) => console.log(`\n== ${t} ==`);

const NECESSARIAS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "AZURE_DEVOPS_ORG", "AZURE_DEVOPS_PAT"];

async function main() {
  titulo("1. Variáveis de ambiente");
  const ausentes = NECESSARIAS.filter((n) => !process.env[n]);
  registrar("Variáveis necessárias presentes", ausentes.length === 0, ausentes.length ? `faltam: ${ausentes.join(", ")}` : NECESSARIAS.join(", "));
  if (ausentes.length) return;
  const hostSupabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;
  console.log(`       Este .env aponta para o Supabase "${hostSupabase}" e a organização Azure "${process.env.AZURE_DEVOPS_ORG}".`);
  console.log("       >>> Confira se a Vercel (Settings > Environment Variables, ambiente Production) aponta para os MESMOS valores.");

  const servico = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const publico = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  titulo("2. Banco de dados (migration e RLS)");
  for (const tabela of ["FluxoPoChecklist", "FluxoPoMovimento", "AllowedUser"]) {
    const { error, count } = await servico.from(tabela).select("*", { count: "exact", head: true });
    registrar(`Tabela ${tabela} existe e responde`, !error, error ? error.message : `${count} linha(s)`);
  }
  // RLS: grava uma linha de teste com a chave de serviço; a chave pública não pode vê-la nem gravar.
  const linhaTeste = { id: `teste-rls-${Date.now()}`, workItemId: -1, etapa: "1.1", itemId: "teste-rls", marcado: false };
  const ins = await servico.from("FluxoPoChecklist").insert(linhaTeste);
  if (ins.error) {
    registrar("Linha de teste gravada com a chave de serviço", false, ins.error.message);
  } else {
    try {
      const vista = await publico.from("FluxoPoChecklist").select("id").eq("workItemId", -1);
      registrar("RLS: a chave pública NÃO enxerga o checklist", !vista.error && (vista.data ?? []).length === 0, vista.error ? vista.error.message : `${(vista.data ?? []).length} linha(s) visíveis para a chave pública`);
      const gravada = await publico.from("FluxoPoChecklist").insert({ id: `teste-rls-anon-${Date.now()}`, workItemId: -1, etapa: "1.1", itemId: "teste-rls-anon", marcado: true });
      registrar("RLS: a chave pública NÃO consegue gravar no checklist", !!gravada.error, gravada.error ? gravada.error.message : "A GRAVAÇÃO PASSOU — RLS desligado!");
      const vistaLog = await publico.from("FluxoPoMovimento").select("id").limit(1);
      registrar("RLS: a chave pública NÃO enxerga o log de movimentos", !vistaLog.error && (vistaLog.data ?? []).length === 0, vistaLog.error ? vistaLog.error.message : "");
    } finally {
      await servico.from("FluxoPoChecklist").delete().eq("workItemId", -1);
      const { count } = await servico.from("FluxoPoChecklist").select("*", { count: "exact", head: true }).eq("workItemId", -1);
      registrar("Linhas de teste do RLS removidas", count === 0, `${count} restante(s)`);
    }
  }

  titulo("3. Azure DevOps");
  const org = process.env.AZURE_DEVOPS_ORG;
  const auth = { Authorization: "Basic " + Buffer.from(`:${process.env.AZURE_DEVOPS_PAT}`).toString("base64") };
  const base = `https://dev.azure.com/${org}/${encodeURIComponent(PROJETO_FLUXO_PO)}/_apis`;
  const proj = await fetch(`${base}/wit/classificationnodes/areas?$depth=1&api-version=7.1`, { headers: auth });
  registrar(`O PAT lê o projeto ${PROJETO_FLUXO_PO} (áreas)`, proj.ok, proj.ok ? `${((await proj.json()).children ?? []).length} esteiras` : `HTTP ${proj.status}`);
  const campos = await fetch(`${base}/wit/workitemtypes/${encodeURIComponent(TIPO_PBI)}/fields?api-version=7.1`, { headers: auth });
  if (campos.ok) {
    const existentes = new Set(((await campos.json()).value ?? []).map((c) => c.referenceName));
    const faltando = CAMPOS_LEITURA_PBI.filter((c) => !existentes.has(c));
    registrar("Todos os campos do Fluxo do PO existem no PBI (Etapa, Classificação, Cliente, Data Comitê...)", faltando.length === 0, faltando.length ? `faltam: ${faltando.join(", ")}` : `${CAMPOS_LEITURA_PBI.length} campos conferidos`);
  } else {
    registrar("Campos do PBI lidos", false, `HTTP ${campos.status}`);
  }
  const tipos = await fetch(`${base}/wit/workitemtypes?api-version=7.1`, { headers: auth });
  registrar(`O tipo "${TIPO_ASSESMENT}" existe`, tipos.ok && ((await tipos.json()).value ?? []).some((t) => t.name === TIPO_ASSESMENT));

  titulo("4. Cadastro de acesso (quem pode movimentar)");
  const { data: usuarios, error } = await servico.from("AllowedUser").select("email, nome, papel, tipo").order("email");
  if (error) {
    registrar("Cadastro de acesso lido", false, error.message);
  } else {
    const movem = usuarios.filter((u) => podeMovimentar(u.papel, u.tipo));
    const semNome = usuarios.filter((u) => !String(u.nome ?? "").trim());
    registrar("Há pelo menos uma pessoa que pode movimentar", movem.length > 0, `${movem.length} de ${usuarios.length} usuários`);
    console.log(`       Podem movimentar (${movem.length}):`);
    for (const u of movem) console.log(`         - ${u.email} | papel: ${u.papel ?? "—"} | tipo: ${u.tipo} | nome: ${u.nome ?? "(sem nome)"}`);
    const so = usuarios.filter((u) => !podeMovimentar(u.papel, u.tipo));
    console.log(`       Só visualizam (${so.length}): ${so.map((u) => `${u.email}${u.papel ? ` [${u.papel}]` : ""}`).join(", ") || "—"}`);
    console.log(`       Sem nome cadastrado (${semNome.length}) — o filtro "Meus itens" e a assinatura dos comentários usam o nome: ${semNome.map((u) => u.email).join(", ") || "—"}`);
    registrar("Quem pode movimentar tem nome cadastrado (para 'Meus itens' e para assinar comentários)", movem.every((u) => String(u.nome ?? "").trim()), movem.filter((u) => !String(u.nome ?? "").trim()).map((u) => u.email).join(", "));
  }
}

main()
  .catch((e) => registrar("Execução do script", false, e.stack ?? String(e)))
  .finally(() => {
    const falhas = resultados.filter((r) => !r.ok);
    console.log(`\nResumo: ${resultados.length - falhas.length} OK, ${falhas.length} com pendência.`);
    process.exit(falhas.length ? 1 : 0);
  });

// Fluxo do PO, etapa 1.2 — valida os "Requisitos de segurança e privacidade de dados" no PBI DE TESTE.
// Roda as MESMAS funções da rota GET/PUT /api/fluxo-po/pbi/{id}/seguranca (sem a camada de login). Ao final devolve a Description ao texto
// original e apaga as linhas de log do teste, mesmo se um passo falhar. O PBI de teste precisa estar na etapa 1.2.
//
// Só aceita o PBI de teste 46766.
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-testar-seguranca.mjs 46766
import { ErroFluxoPo, aplicarPatchPbi, lerPbiFluxoPoAtual } from "../lib/fluxo-po-servidor.ts";
import { lerDescricaoAgora, lerSegurancaDoPbi, registrarSeguranca } from "../lib/fluxo-po-seguranca-servidor.ts";
import { PERGUNTAS_SEGURANCA, lerSegurancaDaDescricao } from "../lib/fluxo-po-seguranca.ts";
import { derivarEtapa } from "../lib/fluxo-po.ts";
import { getServiceClient } from "../lib/supabase.ts";

const PBI_DE_TESTE = 46766;
const id = Number(process.argv[2]);
if (id !== PBI_DE_TESTE) {
  console.error(`Recusado: este script só grava no PBI de teste ${PBI_DE_TESTE}. Uso: ... scripts/azure-testar-seguranca.mjs ${PBI_DE_TESTE}`);
  process.exit(1);
}

const admin = { email: "script-teste-seguranca@local", nome: "Script de teste (segurança)", tipo: "adm", papel: null };
const cs = { email: "visitante-seguranca@local", nome: "Visitante", tipo: "user", papel: "CS" };
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
const respostas = (modelo) => PERGUNTAS_SEGURANCA.map((p, i) => ({ id: p.id, resposta: modelo === 1 ? (["sim", "nao", "na"])[i % 3] : "sim", observacao: i === 0 ? (modelo === 1 ? 'Obs com <tags> & "aspas"\nsegunda linha' : "Observação revisada") : "" }));

const inicial = await lerDescricaoAgora(id);
const original = inicial.descricaoBruta;
const etapa = derivarEtapa(await lerPbiFluxoPoAtual(id)).etapa;
console.log(`PBI ${id}: etapa ${etapa}, Description com ${original.length} caracteres.`);

try {
  if (etapa !== "1.2") throw new Error(`O PBI de teste está na etapa ${etapa}; este teste precisa dele na 1.2.`);
  if (lerSegurancaDaDescricao(original)) throw new Error("O PBI de teste já tem o formulário na Description; retire-o antes.");
  const estado0 = await lerSegurancaDoPbi(id);
  registrar("Estado inicial: não registrado, em branco, etapa 1.2", !estado0.registrado && estado0.etapa === "1.2" && estado0.itens.every((i) => i.resposta === null));

  await esperarErro("Sem permissão (CS) → 403", 403, () => registrarSeguranca({ id, respostas: respostas(1), base: null, usuario: cs }));
  await esperarErro("Formulário incompleto → 422", 422, () => registrarSeguranca({ id, respostas: respostas(1).slice(0, 4), base: null, usuario: admin }));

  const r1 = await registrarSeguranca({ id, respostas: respostas(1), base: null, usuario: admin });
  const apos1 = (await lerDescricaoAgora(id)).descricaoBruta;
  registrar("Registra: formulário volta idêntico na leitura", r1.estado.registrado && JSON.stringify(r1.estado.itens) === JSON.stringify(respostas(1).map((i) => ({ ...i }))), `${apos1.length} caracteres`);
  registrar("A Description original ficou intacta no começo", apos1.startsWith(original));
  registrar("O Azure manteve o id do bloco (o grava sem aspas)", /id=["']?kmm-requisitos-seguranca/.test(apos1));
  registrar("Só há um formulário na Description", (apos1.match(/<table/gi) ?? []).length === (original.match(/<table/gi) ?? []).length + 1);

  const r2 = await registrarSeguranca({ id, respostas: respostas(2), base: r1.estado.itens, usuario: admin });
  const apos2 = (await lerDescricaoAgora(id)).descricaoBruta;
  registrar("Registrar de novo substitui (continua um só) e muda as respostas", (apos2.match(/<table/gi) ?? []).length === (original.match(/<table/gi) ?? []).length + 1 && (apos2.match(/<div/gi) ?? []).length === (original.match(/<div/gi) ?? []).length + 1 && r2.estado.itens[1].resposta === "sim" && r2.estado.itens[0].observacao === "Observação revisada");
  registrar("A Description original continua intacta no começo", apos2.startsWith(original));

  await esperarErro("Base desatualizada (outra pessoa mudou) → 409", 409, () => registrarSeguranca({ id, respostas: respostas(1), base: r1.estado.itens, usuario: admin }));

  const { data: linhas, error } = await getServiceClient().from("FluxoPoMovimento").select("direcao, resultado").eq("workItemId", id).in("usuario", USUARIOS).gte("criadoEm", INICIO);
  if (error) throw new Error(`Falha ao ler o log: ${error.message}`);
  registrar("Todas as tentativas foram para o log (direção seguranca)", (linhas ?? []).length >= 5 && linhas.every((l) => l.direcao === "seguranca"), JSON.stringify((linhas ?? []).map((l) => l.resultado)));
} finally {
  try {
    const agora = await lerDescricaoAgora(id);
    await aplicarPatchPbi(id, [
      { op: "test", path: "/rev", value: agora.rev },
      original === "" ? { op: "remove", path: "/fields/System.Description" } : { op: "add", path: "/fields/System.Description", value: original },
    ]);
    const final = (await lerDescricaoAgora(id)).descricaoBruta;
    registrar("Description do PBI de teste devolvida ao original", final === original || final.trim() === original.trim(), `${final.length} caracteres`);
  } catch (e) {
    registrar("Description do PBI de teste devolvida ao original", false, String(e));
  }
  const { error } = await getServiceClient().from("FluxoPoMovimento").delete().eq("workItemId", id).in("usuario", USUARIOS).gte("criadoEm", INICIO);
  registrar("Linhas de log do teste apagadas", !error, error?.message ?? "");
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} passos OK.`);
process.exit(falhas.length ? 1 : 0);

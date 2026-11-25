// Fluxo do PO, etapa 2.1 — valida "Registrar Análise" (Description do Assesment filho) no PBI DE TESTE.
// Roda as MESMAS funções da rota GET/PUT /api/fluxo-po/pbi/{id}/analise (sem a camada de login). Ao final devolve o Description do Assesment
// ao valor original (a revisão do Assesment só sobe, não volta) e apaga as linhas de log do teste, mesmo se um passo falhar.
// Passos sem gravar: leitura dos Assesments, sem permissão (403), texto vazio (422), Assesment que não é filho (422), revisão velha (409).
// Passo gravando: registrar a análise e conferir o texto limpo e o log. O PBI precisa estar na etapa 2.1 (no quadro) para esse passo;
// com PREPARAR_2_1=1 o script põe o PBI de teste na 2.1 (só o campo Etapa = Comitê) durante o teste e devolve a Etapa original no fim.
//
// Só aceita o PBI de teste 46766 (e o Assesment filho dele, 46767).
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-testar-analise.mjs 46766
import { ErroFluxoPo, aplicarPatchPbi, lerPbiFluxoPoAtual } from "../lib/fluxo-po-servidor.ts";
import { lerAnalisesDoPbi, lerAssesmentAgora, registrarAnalise } from "../lib/fluxo-po-analise-servidor.ts";
import { derivarEtapa } from "../lib/fluxo-po.ts";
import { CAMPOS_PBI, ETAPA } from "../lib/fluxo-po-campos.ts";
import { getServiceClient } from "../lib/supabase.ts";

const PBI_DE_TESTE = 46766;
const ASSESMENT_DE_TESTE = 46767;
const id = Number(process.argv[2]);
if (id !== PBI_DE_TESTE) {
  console.error(`Recusado: este script só grava no PBI de teste ${PBI_DE_TESTE}. Uso: ... scripts/azure-testar-analise.mjs ${PBI_DE_TESTE}`);
  process.exit(1);
}

const admin = { email: "script-teste-analise@local", nome: "Script de teste (análise)", tipo: "adm", papel: null };
const cs = { email: "visitante-analise@local", nome: "Visitante", tipo: "user", papel: "CS" };
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
    registrar(passo, e instanceof ErroFluxoPo && e.status === status, e instanceof ErroFluxoPo ? `${e.status} ${e.codigo}: ${e.message}` : String(e));
  }
}

// O Azure normaliza o HTML ao gravar (acrescenta espaços antes de tags de fechamento): compara sem esses espaços.
const limpo = (h) => h.replace(/\s+/g, " ").replace(/ </g, "<").replace(/> /g, ">").trim();
const ESPERADO = limpo("<div>Análise de teste <b>automática</b></div><ul><li>item</li></ul>");

const original = await lerAssesmentAgora(ASSESMENT_DE_TESTE);
const descricaoOriginal = original.descricaoBruta;
console.log(`Assesment ${ASSESMENT_DE_TESTE}: rev ${original.rev}, Description com ${descricaoOriginal.length} caracteres.`);
let gravou = false;
let etapaOriginalDoPbi; // preenchido só se o script mudou a Etapa do PBI de teste

try {
  let pbi = await lerPbiFluxoPoAtual(id);
  if (derivarEtapa(pbi).etapa !== "2.1" && process.env.PREPARAR_2_1 === "1") {
    etapaOriginalDoPbi = pbi.etapa ?? "";
    await aplicarPatchPbi(id, [{ op: "test", path: "/rev", value: pbi.rev }, { op: "add", path: `/fields/${CAMPOS_PBI.etapa}`, value: ETAPA.comite }]);
    pbi = await lerPbiFluxoPoAtual(id);
    console.log(`Preparação: Etapa do PBI de teste "${etapaOriginalDoPbi}" → "${ETAPA.comite}" (será devolvida no fim).`);
  }
  const etapa = derivarEtapa(pbi).etapa;
  console.log(`PBI ${id}: etapa ${etapa}.`);

  const { assesments } = await lerAnalisesDoPbi(id);
  registrar("Lê os Assesments filhos", assesments.some((a) => a.id === ASSESMENT_DE_TESTE), `${assesments.length} encontrado(s): ${assesments.map((a) => a.id).join(", ")}`);

  const pedido = (extra = {}) => ({ id, assesmentId: ASSESMENT_DE_TESTE, html: "<div>Análise de teste <b>automática</b></div>", rev: original.rev, usuario: admin, ...extra });
  await esperarErro("Sem permissão (CS) → 403", 403, () => registrarAnalise(pedido({ usuario: cs })));
  await esperarErro("Texto vazio → 422", 422, () => registrarAnalise(pedido({ html: "<div><br></div>" })));
  await esperarErro("Assesment que não é filho → 422", 422, () => registrarAnalise(pedido({ assesmentId: 1 })));

  if (etapa !== "2.1") {
    await esperarErro("Card fora da 2.1 → 422", 422, () => registrarAnalise(pedido()));
    console.log("O PBI não está na etapa 2.1: o passo de gravação foi PULADO (coloque o PBI de teste na 2.1 e rode de novo).");
  } else {
    await esperarErro("Revisão velha → 409, nada gravado", 409, () => registrarAnalise(pedido({ rev: original.rev - 1 })));
    const antes = await lerAssesmentAgora(ASSESMENT_DE_TESTE);
    registrar("Conflito não gravou nada", antes.descricaoBruta === descricaoOriginal && antes.rev === original.rev);

    gravou = true;
    const r = await registrarAnalise(pedido({ html: '<div onclick="x()">Análise de teste <b>automática</b></div><script>alert(1)</script><ul><li>item</li></ul>' }));
    registrar("Registra a análise", limpo(r.assesment.html) === ESPERADO, `rev ${original.rev} → ${r.assesment.rev}; html lido: ${JSON.stringify(r.assesment.html)}`);
    const depois = await lerAssesmentAgora(ASSESMENT_DE_TESTE);
    registrar("Azure ficou com o texto limpo", limpo(depois.descricaoBruta) === ESPERADO, `bruto no Azure: ${JSON.stringify(depois.descricaoBruta)}`);
    await esperarErro("Reusar a revisão antiga depois de gravar → 409", 409, () => registrarAnalise(pedido({ rev: original.rev })));
  }

  const { data: linhas, error } = await getServiceClient().from("FluxoPoMovimento").select("direcao, resultado, usuario").eq("workItemId", id).in("usuario", USUARIOS).gte("criadoEm", INICIO);
  if (error) throw new Error(`Falha ao ler o log: ${error.message}`);
  const porResultado = Object.fromEntries(Object.entries((linhas ?? []).reduce((a, l) => ({ ...a, [l.resultado]: (a[l.resultado] ?? 0) + 1 }), {})));
  registrar("Todas as tentativas foram para o log (direção analise)", (linhas ?? []).length > 0 && linhas.every((l) => l.direcao === "analise"), JSON.stringify(porResultado));
} finally {
  // Devolve o Description original (ou o remove, se não existia) — a revisão do Assesment não volta, o texto sim.
  try {
    const agora = await lerAssesmentAgora(ASSESMENT_DE_TESTE);
    if (agora.descricaoBruta !== descricaoOriginal) {
      await aplicarPatchPbi(ASSESMENT_DE_TESTE, [
        { op: "test", path: "/rev", value: agora.rev },
        descricaoOriginal === "" ? { op: "remove", path: "/fields/System.Description" } : { op: "add", path: "/fields/System.Description", value: descricaoOriginal },
      ]);
    }
    const final = await lerAssesmentAgora(ASSESMENT_DE_TESTE);
    registrar("Description do Assesment de teste devolvido ao original", final.descricaoBruta === descricaoOriginal, gravou ? `rev ${original.rev} → ${final.rev}` : "nada tinha sido gravado");
  } catch (e) {
    registrar("Description do Assesment de teste devolvido ao original", false, String(e));
  }
  if (etapaOriginalDoPbi !== undefined) {
    try {
      const agora = await lerPbiFluxoPoAtual(id);
      await aplicarPatchPbi(id, [
        { op: "test", path: "/rev", value: agora.rev },
        etapaOriginalDoPbi === "" ? { op: "remove", path: `/fields/${CAMPOS_PBI.etapa}` } : { op: "add", path: `/fields/${CAMPOS_PBI.etapa}`, value: etapaOriginalDoPbi },
      ]);
      const final = await lerPbiFluxoPoAtual(id);
      registrar("Etapa do PBI de teste devolvida ao original", (final.etapa ?? "") === etapaOriginalDoPbi, `"${final.etapa ?? ""}"`);
    } catch (e) {
      registrar("Etapa do PBI de teste devolvida ao original", false, String(e));
    }
  }
  const { error } = await getServiceClient().from("FluxoPoMovimento").delete().eq("workItemId", id).in("usuario", USUARIOS).gte("criadoEm", INICIO);
  registrar("Linhas de log do teste apagadas", !error, error?.message ?? "");
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} passos OK.`);
process.exit(falhas.length ? 1 : 0);

// T05 do Fluxo do PO — valida a gravação do movimento de etapa (lib/fluxo-po-servidor.ts) no PBI DE TESTE.
//
// Roda a MESMA função que a rota POST /api/fluxo-po/mover usa (sem a camada de login) e, ao final, devolve o PBI ao
// estado original (Etapa e Data Comitê), mesmo se um passo falhar. Antes de gravar, faz os testes que NÃO gravam:
//   permissão negada (403), destino inválido (422), data inválida (422), Data Comitê ausente (422) e conflito de
//   revisão (409). Depois: 1.2 → 2.1 (com Data Comitê), confere o formato salvo no Azure, volta 2.1 → 1.2 e restaura.
//
// O PBI precisa estar em 1.2 (Status Backlog, Etapa Backlog, Area Path de uma esteira do KMM5). Só aceita o PBI de teste
// 46766; outro ID exige FLUXO_PO_PERMITIR_OUTRO_ID=1 (não use PBI real).
//
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-testar-mover.mjs 46766

import { ErroFluxoPo, aplicarPatchPbi, lerPbiFluxoPoAtual, moverPbiFluxoPo } from "../lib/fluxo-po-servidor.ts";
import { chaveDia, derivarEtapa } from "../lib/fluxo-po.ts";
import { CAMPOS_PBI } from "../lib/fluxo-po-campos.ts";

const PBI_DE_TESTE = 46766;
const id = Number(process.argv[2]);
const DATA_TESTE = "2031-12-31";

if (!Number.isInteger(id) || id <= 0) {
  console.error("Informe o ID do PBI de teste: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-testar-mover.mjs 46766");
  process.exit(1);
}
if (id !== PBI_DE_TESTE && process.env.FLUXO_PO_PERMITIR_OUTRO_ID !== "1") {
  console.error(`Recusado: este script só grava no PBI de teste ${PBI_DE_TESTE}. (Outro ID exige FLUXO_PO_PERMITIR_OUTRO_ID=1 — nunca use PBI real.)`);
  process.exit(1);
}

const admin = { email: "script-teste@local", nome: "Script de teste (T05)", tipo: "adm", papel: null };
const semPermissao = { email: "visitante@local", nome: "Visitante", tipo: "user", papel: "CS" };
const resultados = [];
const registrar = (passo, ok, detalhe = "") => {
  resultados.push({ passo, ok });
  console.log(`${ok ? "OK    " : "FALHOU"} ${passo}${detalhe ? ` — ${detalhe}` : ""}`);
};

/** Executa e espera um ErroFluxoPo com o status dado (passo que NÃO deve gravar). */
async function esperarErro(passo, statusEsperado, fn, conferir) {
  try {
    await fn();
    registrar(passo, false, "deveria ter sido recusado, mas passou");
  } catch (e) {
    const ok = e instanceof ErroFluxoPo && e.status === statusEsperado && (conferir ? conferir(e) : true);
    registrar(passo, ok, e instanceof ErroFluxoPo ? `HTTP ${e.status} (${e.codigo}): ${e.message}${e.faltas.length ? ` | faltas: ${e.faltas.join(" / ")}` : ""}` : String(e));
  }
}

const resumo = (p) => ({ etapa: p.etapa, status: p.status, areaPath: p.areaPath, tags: p.tags, cliente: p.cliente, classificacao: p.classificacao, dataComite: p.dataComite });

async function main() {
  console.log(`PBI de teste: ${id}\n`);
  const inicial = await lerPbiFluxoPoAtual(id);
  console.log("Estado inicial:", JSON.stringify(resumo(inicial)), `| rev ${inicial.rev}\n`);
  if (derivarEtapa(inicial).etapa !== "1.2") {
    registrar("Pré-condição: PBI em 1.2", false, `está em ${derivarEtapa(inicial).etapa ?? "fora do quadro"}; deixe Backlog/Backlog numa esteira do KMM5`);
    return;
  }
  let precisaRestaurar = false;

  try {
    // ---- 1. Passos que NÃO gravam ----
    await esperarErro("Sem permissão (perfil CS)", 403, () => moverPbiFluxoPo({ id, destino: "2.1", entrada: { dataComite: DATA_TESTE }, usuario: semPermissao }));
    await esperarErro("Destino inválido", 422, () => moverPbiFluxoPo({ id, destino: "9.9", usuario: admin }));
    await esperarErro("Entrada com campo não permitido", 422, () => moverPbiFluxoPo({ id, destino: "2.1", entrada: { etapa: "Comitê" }, usuario: admin }));
    await esperarErro("Data Comitê inválida", 422, () => moverPbiFluxoPo({ id, destino: "2.1", entrada: { dataComite: "2026-02-31" }, usuario: admin }), (e) => e.faltas.length > 0);
    if (inicial.dataComite) {
      console.log("(PBI já tem Data Comitê; pulando o teste de 'Data Comitê ausente')");
    } else {
      await esperarErro("Data Comitê ausente", 422, () => moverPbiFluxoPo({ id, destino: "2.1", usuario: admin }), (e) => e.faltas.some((f) => /Data Comitê/.test(f)));
    }
    await esperarErro("Movimento não previsto (1.2 → 3.1)", 422, () => moverPbiFluxoPo({ id, destino: "3.1", usuario: admin }));
    await esperarErro("Conflito de revisão (test /rev desatualizado)", 409, () =>
      aplicarPatchPbi(id, [{ op: "test", path: "/rev", value: inicial.rev - 1 }, { op: "add", path: `/fields/${CAMPOS_PBI.tags}`, value: "nao-deve-gravar" }]),
    );
    const apos = await lerPbiFluxoPoAtual(id);
    registrar("Nenhum passo recusado gravou nada", apos.rev === inicial.rev, `rev ${inicial.rev} → ${apos.rev}`);

    // ---- 2. Avanço 1.2 → 2.1 ----
    precisaRestaurar = true;
    const r1 = await moverPbiFluxoPo({ id, destino: "2.1", entrada: { dataComite: DATA_TESTE }, usuario: admin });
    registrar("Mover 1.2 → 2.1 (200)", r1.card?.etapa === "2.1" && r1.direcao === "avanco", `card em ${r1.card?.etapa}; gravou ${r1.alteracoes.map((a) => a.rotulo).join(", ")}`);
    registrar("Data Comitê salva no formato do Azure (meia-noite de Brasília)", r1.card?.pbi.dataComite === `${DATA_TESTE}T03:00:00Z`, `valor lido: ${r1.card?.pbi.dataComite}`);
    registrar("Mesmo dia na leitura (chaveDia)", chaveDia(r1.card?.pbi.dataComite) === DATA_TESTE);
    registrar("Status continua Backlog e Etapa = Comitê", r1.card?.pbi.status === "Backlog" && r1.card?.pbi.etapa === "Comitê");
    if (r1.avisos.length) console.log("       avisos:", r1.avisos.join(" | "));

    // ---- 3. Volta 2.1 → 1.2 (proposta) ----
    const r2 = await moverPbiFluxoPo({ id, destino: "1.2", usuario: admin });
    registrar("Voltar 2.1 → 1.2 (200)", r2.card?.etapa === "1.2" && r2.direcao === "volta" && r2.proposta === true, `card em ${r2.card?.etapa}`);
    registrar("Volta mantém a Data Comitê", r2.card?.pbi.dataComite === `${DATA_TESTE}T03:00:00Z`);
  } finally {
    // ---- 4. Restauração do estado original ----
    if (precisaRestaurar) {
      const atual = await lerPbiFluxoPoAtual(id);
      const ops = [{ op: "test", path: "/rev", value: atual.rev }];
      if (atual.etapa !== inicial.etapa) ops.push({ op: "add", path: `/fields/${CAMPOS_PBI.etapa}`, value: inicial.etapa });
      if ((atual.dataComite ?? null) !== (inicial.dataComite ?? null)) {
        ops.push(inicial.dataComite ? { op: "add", path: `/fields/${CAMPOS_PBI.dataComite}`, value: inicial.dataComite } : { op: "remove", path: `/fields/${CAMPOS_PBI.dataComite}` });
      }
      if (ops.length > 1) {
        try {
          await aplicarPatchPbi(id, ops);
        } catch (e) {
          registrar("Restaurar o estado original", false, `${e.message} — RESTAURE O PBI ${id} MANUALMENTE: Etapa "${inicial.etapa}", Data Comitê ${inicial.dataComite ?? "(vazia)"}`);
        }
      }
      const final = await lerPbiFluxoPoAtual(id);
      const igual = JSON.stringify(resumo(final)) === JSON.stringify(resumo(inicial));
      registrar("Estado final igual ao inicial", igual, igual ? "" : `inicial ${JSON.stringify(resumo(inicial))} | final ${JSON.stringify(resumo(final))}`);
    }
  }
}

main()
  .catch((e) => registrar("Execução do script", false, e instanceof ErroFluxoPo ? `${e.status} ${e.message}` : e.stack ?? String(e)))
  .finally(() => {
    const falhas = resultados.filter((r) => !r.ok);
    console.log(`\nResumo: ${resultados.length - falhas.length} OK, ${falhas.length} com falha.`);
    process.exit(falhas.length ? 1 : 0);
  });

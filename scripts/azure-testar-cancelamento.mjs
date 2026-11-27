// Teste de INTEGRAÇÃO do cancelamento de demanda (lib/fluxo-po-cancelamento-servidor.ts) contra o Azure DevOps e o Supabase REAIS, só no
// PBI DE TESTE. Roda as MESMAS funções da rota POST /api/fluxo-po/pbi/{id}/cancelamento (sem a camada de login).
// Cobre: permissão (403), entrada inválida (motivo, texto vazio, texto longo), cancelamento com o comentário
// FALHANDO (o Status já mudou e o aviso diz isso), cancelamento real com texto EDITADO (comentário no PBI com assinatura, motivo e o
// texto editado; Status "Cancelado"; o card sai do quadro; um segundo cancelamento é recusado) e o log de todas as tentativas.
// Ao final devolve o Status e a etapa ao que estavam (Azure permite voltar de "Cancelado" para "Backlog"), apaga os comentários criados
// e as linhas de log do teste, mesmo se um passo falhar.
//
// O PBI precisa estar em 1.1 ou 1.2 (Status Backlog). Só aceita o PBI de teste 46766.
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-testar-cancelamento.mjs 46766

import { ErroFluxoPo, aplicarPatchPbi, apagarComentarioPbi, lerPbiFluxoPoAtual } from "../lib/fluxo-po-servidor.ts";
import { cancelarDemandaPbi } from "../lib/fluxo-po-cancelamento-servidor.ts";
import { getFluxoPoUpstream } from "../lib/devops-client.ts";
import { LIMITE_COMENTARIO, MOTIVOS_CANCELAMENTO, derivarEtapa } from "../lib/fluxo-po.ts";
import { CAMPOS_PBI } from "../lib/fluxo-po-campos.ts";
import { getServiceClient } from "../lib/supabase.ts";

const PBI_DE_TESTE = 46766;
const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
  console.error("Informe o ID do PBI de teste: ... scripts/azure-testar-cancelamento.mjs 46766");
  process.exit(1);
}
if (id !== PBI_DE_TESTE && process.env.FLUXO_PO_PERMITIR_OUTRO_ID !== "1") {
  console.error(`Recusado: este script só grava no PBI de teste ${PBI_DE_TESTE} (outro ID exige FLUXO_PO_PERMITIR_OUTRO_ID=1 — nunca use PBI real).`);
  process.exit(1);
}

const ORG = process.env.AZURE_DEVOPS_ORG;
const auth = { Authorization: "Basic " + Buffer.from(`:${process.env.AZURE_DEVOPS_PAT}`).toString("base64") };
const admin = { email: "script-teste@local", nome: "Script de teste (cancelamento)", tipo: "adm", papel: null };
const semPermissao = { email: "visitante@local", nome: "Visitante", tipo: "user", papel: "CS" };
const USUARIOS = ["script-teste@local", "visitante@local"];
// Folga de 30 s: o relógio desta máquina pode adiantar em relação ao do banco (criadoEm vem do banco).
const INICIO = new Date(Date.now() - 30_000).toISOString();
const comentarios = [];
const resultados = [];
let tentativas = 0;
const registrar = (passo, ok, detalhe = "") => {
  resultados.push({ passo, ok });
  console.log(`${ok ? "OK    " : "FALHOU"} ${passo}${detalhe ? ` — ${detalhe}` : ""}`);
};
const cancelar = async (motivo, texto, usuario = admin, extra = {}) => {
  tentativas++;
  const r = await cancelarDemandaPbi({ id, motivo, texto, usuario, ...extra });
  if (r.comentario?.id) comentarios.push(r.comentario.id);
  return r;
};
async function esperarErro(passo, status, fn, conferir) {
  try {
    await fn();
    registrar(passo, false, "deveria ter sido recusado, mas passou");
  } catch (e) {
    registrar(passo, e instanceof ErroFluxoPo && e.status === status && (conferir ? conferir(e) : true), e instanceof ErroFluxoPo ? `HTTP ${e.status} (${e.codigo}): ${e.message}${e.faltas.length ? ` | ${e.faltas.join(" / ")}` : ""}` : String(e));
  }
}
async function textoDoComentario(cid) {
  const r = await fetch(`https://dev.azure.com/${ORG}/KMM5/_apis/wit/workItems/${id}/comments/${cid}?api-version=7.1-preview.4`, { headers: auth });
  return r.ok ? String((await r.json()).text ?? "") : "";
}
const resumo = (p) => ({ etapa: p.etapa, status: p.status, areaPath: p.areaPath, tags: p.tags, cliente: p.cliente, classificacao: p.classificacao, dataComite: p.dataComite });
const falhaDeComentario = async () => {
  throw new ErroFluxoPo(502, "simulado", "falha simulada pelo teste");
};

async function voltarStatus(paraStatus) {
  const a = await lerPbiFluxoPoAtual(id);
  await aplicarPatchPbi(id, [{ op: "test", path: "/rev", value: a.rev }, { op: "add", path: `/fields/${CAMPOS_PBI.status}`, value: paraStatus }]);
}

async function main() {
  const inicial = await lerPbiFluxoPoAtual(id);
  console.log("Estado inicial:", JSON.stringify(resumo(inicial)), `| rev ${inicial.rev}\n`);
  const etapaInicial = derivarEtapa(inicial).etapa;
  if (!["1.1", "1.2"].includes(etapaInicial) || inicial.status !== "Backlog") {
    registrar("Pré-condição: PBI de teste em 1.1 ou 1.2 (Status Backlog)", false, `está em ${etapaInicial ?? "fora do quadro"}, Status ${inicial.status}`);
    return;
  }
  let precisaRestaurar = false;

  try {
    // ---- recusas que não gravam ----
    const texto = MOTIVOS_CANCELAMENTO[3].texto;
    await esperarErro("Sem permissão (perfil CS) → 403", 403, () => cancelar("tns", texto, semPermissao));
    await esperarErro("Motivo inexistente → 422", 422, () => cancelar("motivo-que-nao-existe", texto));
    await esperarErro("Texto vazio → 422", 422, () => cancelar("tns", "   "));
    await esperarErro(`Texto acima de ${LIMITE_COMENTARIO} caracteres → 422`, 422, () => cancelar("tns", "x".repeat(LIMITE_COMENTARIO + 1)));
    registrar("Nenhuma recusa gravou nada", (await lerPbiFluxoPoAtual(id)).rev === inicial.rev, `rev ${inicial.rev}`);

    // (desde 2026-11-23 cancela-se tanto na 1.1 quanto na 1.2: não é preciso levar o card à 1.1)
    precisaRestaurar = true;

    // ---- cancelamento com o comentário falhando: o Status já mudou, e o aviso diz isso ----
    const a = await cancelar("erp", MOTIVOS_CANCELAMENTO[2].texto, admin, { publicador: falhaDeComentario });
    registrar("Comentário com falha NÃO desfaz o cancelamento: Status Cancelado + aviso para publicar o texto à mão", a.pbi.status === "Cancelado" && a.comentario.publicado === false && a.avisos.some((x) => x.includes("Cancelado") && x.includes("comentário")), a.avisos.join(" | "));
    registrar("...e o PBI saiu do fluxo (nenhuma etapa)", derivarEtapa(a.pbi).etapa === null);
    await voltarStatus("Backlog");
    const aposVolta = await lerPbiFluxoPoAtual(id);
    registrar("O Azure aceita devolver o Status de Cancelado para Backlog (restauração) e o card volta à etapa de origem", aposVolta.status === "Backlog" && derivarEtapa(aposVolta).etapa === etapaInicial, `Status ${aposVolta.status}, etapa ${derivarEtapa(aposVolta).etapa}`);

    // ---- cancelamento real, com o texto EDITADO pelo usuário ----
    const editado = `${MOTIVOS_CANCELAMENTO[3].texto}\nObservação escrita pelo usuário no teste: texto editado antes de publicar.`;
    const b = await cancelar("tns", editado);
    registrar("Cancelamento real: Status vira Cancelado e o comentário é publicado", b.pbi.status === "Cancelado" && b.comentario.publicado === true && b.alteracoes.length === 1 && b.alteracoes[0].para === "Cancelado", `comentário ${b.comentario.id}`);
    const t = b.comentario.id ? await textoDoComentario(b.comentario.id) : "";
    registrar("...comentário com [PÚBLICO], motivo e o TEXTO EDITADO (não o padrão puro)", t.includes("[PÚBLICO] Cancelamento de demanda") && t.includes("TNS") && t.includes("ecossistema NS Tech") && t.includes("texto editado antes de publicar"), t.slice(0, 220));
    const quadro = await getFluxoPoUpstream();
    registrar("...o card SAIU do quadro do Fluxo do PO", !quadro.cards.some((c) => c.pbi.id === id), `${quadro.cards.length} cards no quadro`);
    await esperarErro("Segundo cancelamento do mesmo PBI → 422 (já não está no fluxo)", 422, () => cancelar("tns", texto));

    // ---- log (T09) ----
    const { data: linhas, error: erroLog } = await getServiceClient().from("FluxoPoMovimento").select("resultado, direcao, destino, usuario").in("usuario", USUARIOS).eq("workItemId", id).gte("criadoEm", INICIO);
    if (erroLog) {
      console.log(`AVISO  Log indisponível (${erroLog.message})`);
    } else {
      const por = {};
      for (const l of linhas) por[l.resultado] = (por[l.resultado] ?? 0) + 1;
      registrar("Log registrou TODAS as tentativas (sucesso, parcial, bloqueios e permissão)", linhas.length === tentativas, `${linhas.length} linhas para ${tentativas} tentativas: ${JSON.stringify(por)}`);
      const canc = linhas.filter((l) => l.direcao === "cancelamento");
      registrar("Log: cancelamentos com destino Cancelado — um parcial (comentário falhou) e um sucesso", canc.some((l) => l.resultado === "parcial" && l.destino === "Cancelado") && canc.some((l) => l.resultado === "sucesso" && l.destino === "Cancelado"), `${canc.length} linha(s) de cancelamento`);
    }
  } finally {
    // restauração: comentários primeiro (apagar comentário sobe a revisão), depois Status, etapa e demais campos
    for (const cid of comentarios) {
      try {
        await apagarComentarioPbi(id, cid);
      } catch (e) {
        registrar(`Apagar comentário ${cid}`, false, `${e.message} — APAGUE MANUALMENTE`);
      }
    }
    if (precisaRestaurar) {
      let atual = await lerPbiFluxoPoAtual(id);
      if (atual.status !== inicial.status) {
        try {
          await voltarStatus(inicial.status);
        } catch (e) {
          registrar("Restaurar o Status", false, `${e.message} — RESTAURE O STATUS DO PBI ${id} PARA "${inicial.status}" MANUALMENTE`);
        }
        atual = await lerPbiFluxoPoAtual(id);
      }
      const ops = [{ op: "test", path: "/rev", value: atual.rev }];
      for (const [k, ref] of [["etapa", CAMPOS_PBI.etapa], ["areaPath", CAMPOS_PBI.areaPath], ["tags", CAMPOS_PBI.tags], ["dataComite", CAMPOS_PBI.dataComite], ["cliente", CAMPOS_PBI.cliente], ["classificacao", CAMPOS_PBI.classificacao]]) {
        if ((atual[k] ?? "") !== (inicial[k] ?? "")) ops.push(inicial[k] ? { op: "add", path: `/fields/${ref}`, value: inicial[k] } : { op: "remove", path: `/fields/${ref}` });
      }
      if (ops.length > 1) {
        try {
          await aplicarPatchPbi(id, ops);
        } catch (e) {
          registrar("Restaurar o PBI", false, `${e.message} — RESTAURE O PBI ${id} MANUALMENTE: ${JSON.stringify(resumo(inicial))}`);
        }
      }
      const final = await lerPbiFluxoPoAtual(id);
      const igual = JSON.stringify(resumo(final)) === JSON.stringify(resumo(inicial));
      registrar("Estado final do PBI igual ao inicial", igual, igual ? "" : `inicial ${JSON.stringify(resumo(inicial))} | final ${JSON.stringify(resumo(final))}`);
    }
    const { error } = await getServiceClient().from("FluxoPoMovimento").delete().in("usuario", USUARIOS).eq("workItemId", id).gte("criadoEm", INICIO);
    registrar("Linhas de teste removidas do log", !error, error?.message ?? "");
  }
}

main()
  .catch((e) => registrar("Execução do script", false, e instanceof ErroFluxoPo ? `${e.status} ${e.message}` : e.stack ?? String(e)))
  .finally(() => {
    const falhas = resultados.filter((r) => !r.ok);
    console.log(`\nResumo: ${resultados.length - falhas.length} OK, ${falhas.length} com falha.`);
    process.exit(falhas.length ? 1 : 0);
  });

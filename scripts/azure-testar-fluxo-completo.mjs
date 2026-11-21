// T20 do Fluxo do PO — teste de INTEGRAÇÃO do fluxo completo contra o Azure DevOps e o Supabase REAIS, só no PBI DE TESTE.
// Roda as MESMAS funções da rota POST /api/fluxo-po/mover (sem a camada de login) e cobre os TRÊS movimentos, o Assesment e o comentário:
//   volta 1.2 → 1.1 (proposta) · 1.1 → 1.2 · 1.2 → 2.1 (+ Data Comitê copiada para o Assesment) · 2.1 → 3.1 e 2.1 → 3.2
//   bloqueios com motivo (nada gravado) · sem permissão (403) · movimentos que não existem (3.x não volta)
//   corrida: dois movimentos ao mesmo tempo no mesmo PBI (só um passa; o outro recebe 409 ou 422, sem comentário nem escrita dele)
//   comentário de transição (texto com origem, destino e usuário) e log de TODAS as tentativas.
// Ao final devolve o PBI, o Assesment e os comentários ao estado original (mesmo se um passo falhar) e apaga as linhas de log do teste.
//
// O PBI precisa estar em 1.2 (Status Backlog, Etapa Backlog, esteira do KMM5), sem Data Comitê e sem tags. Só aceita o PBI de teste 46766.
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-testar-fluxo-completo.mjs 46766

import { ErroFluxoPo, aplicarPatchPbi, apagarComentarioPbi, lerPbiFluxoPoAtual, listarAssesmentsFilhos, moverPbiFluxoPo } from "../lib/fluxo-po-servidor.ts";
import { derivarEtapa } from "../lib/fluxo-po.ts";
import { CAMPOS_ASSESMENT, CAMPOS_PBI, TAG_PRONTO_REFINAMENTO_TECH } from "../lib/fluxo-po-campos.ts";
import { getServiceClient } from "../lib/supabase.ts";

const PBI_DE_TESTE = 46766;
const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
  console.error("Informe o ID do PBI de teste: ... scripts/azure-testar-fluxo-completo.mjs 46766");
  process.exit(1);
}
if (id !== PBI_DE_TESTE && process.env.FLUXO_PO_PERMITIR_OUTRO_ID !== "1") {
  console.error(`Recusado: este script só grava no PBI de teste ${PBI_DE_TESTE} (outro ID exige FLUXO_PO_PERMITIR_OUTRO_ID=1 — nunca use PBI real).`);
  process.exit(1);
}

const ORG = process.env.AZURE_DEVOPS_ORG;
const auth = { Authorization: "Basic " + Buffer.from(`:${process.env.AZURE_DEVOPS_PAT}`).toString("base64") };
const admin = { email: "script-teste@local", nome: "Script de teste (T20)", tipo: "adm", papel: null };
const semPermissao = { email: "visitante@local", nome: "Visitante", tipo: "user", papel: "CS" };
const USUARIOS = ["script-teste@local", "visitante@local"];
const INICIO = new Date().toISOString();
const DATA = "2031-12-31";
const DATA_AZURE = `${DATA}T03:00:00Z`;
const comentarios = [];
const resultados = [];
let tentativas = 0;
const registrar = (passo, ok, detalhe = "") => {
  resultados.push({ passo, ok });
  console.log(`${ok ? "OK    " : "FALHOU"} ${passo}${detalhe ? ` — ${detalhe}` : ""}`);
};
const mover = async (destino, entrada, usuario = admin) => {
  tentativas++;
  const r = await moverPbiFluxoPo({ id, destino, entrada, usuario });
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
const resumo = (p) => ({ etapa: p.etapa, status: p.status, areaPath: p.areaPath, tags: p.tags, cliente: p.cliente, classificacao: p.classificacao, dataAberturaProduto: p.dataAberturaProduto, dataComite: p.dataComite });
const semMudanca = async (passo, revAntes) => registrar(passo, (await lerPbiFluxoPoAtual(id)).rev === revAntes, `rev ${revAntes}`);

async function restaurarAssesment(aid, original) {
  const op = original ? { op: "add", path: `/fields/${CAMPOS_ASSESMENT.dataComite}`, value: original } : { op: "remove", path: `/fields/${CAMPOS_ASSESMENT.dataComite}` };
  const r = await fetch(`https://dev.azure.com/${ORG}/_apis/wit/workitems/${aid}?api-version=7.1`, { method: "PATCH", headers: { "Content-Type": "application/json-patch+json", ...auth }, body: JSON.stringify([op]) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

async function main() {
  const inicial = await lerPbiFluxoPoAtual(id);
  const filhosIniciais = await listarAssesmentsFilhos(id);
  console.log("Estado inicial:", JSON.stringify(resumo(inicial)), `| rev ${inicial.rev}`);
  console.log("Assesments filhos:", JSON.stringify(filhosIniciais), "\n");
  const ok0 = derivarEtapa(inicial).etapa === "1.2" && !inicial.dataComite && !inicial.tags && inicial.cliente && inicial.classificacao && inicial.dataAberturaProduto;
  if (!ok0) {
    registrar("Pré-condição: PBI em 1.2, sem Data Comitê e sem tags, com Cliente, Classificação e Data Abertura Produto", false, "ajuste o PBI de teste e rode de novo");
    return;
  }
  let precisaRestaurar = false;

  try {
    // ---- permissão e movimentos inexistentes (sem gravar) ----
    await esperarErro("Sem permissão (perfil CS) → 403", 403, () => mover("2.1", { dataComite: DATA }, semPermissao));
    await esperarErro("1.2 → 3.1 pula a 2.1 → 422", 422, () => mover("3.1"));
    await semMudanca("Nada foi gravado até aqui", inicial.rev);

    // ---- VOLTA 1.2 → 1.1 (proposta): Area Path volta para KMM5 ----
    precisaRestaurar = true;
    const v = await mover("1.1");
    registrar("Volta 1.2 → 1.1 (proposta): Area Path vira KMM5 e o card vai para a 1.1", v.card?.etapa === "1.1" && v.card?.pbi.areaPath === "KMM5" && v.proposta === true && v.direcao === "volta", `card em ${v.card?.etapa}; area ${v.card?.pbi.areaPath}`);
    registrar("...e o comentário de transição foi publicado", v.comentario.publicado === true, `id ${v.comentario.id}`);

    // ---- MOVIMENTO 1: 1.1 → 1.2 ----
    const revNa11 = (await lerPbiFluxoPoAtual(id)).rev;
    await esperarErro("1.1 → 1.2 sem esteira → 422 com o motivo", 422, () => mover("1.2"), (e) => e.faltas.some((f) => f.includes("esteira")));
    await esperarErro("1.1 → 1.2 com Area Path fora do KMM5 → 422", 422, () => mover("1.2", { areaPath: "KMM4\\TMS - Rangers" }), (e) => e.faltas.some((f) => f.includes("esteira do KMM5")));
    await esperarErro("1.1 → 1.2 com Classificação fora da lista → 422", 422, () => mover("1.2", { areaPath: inicial.areaPath, classificacao: "Classificação Inventada" }), (e) => e.faltas.some((f) => f.includes("não existe na lista")));
    await semMudanca("Os bloqueios da 1.1 não gravaram nada", revNa11);
    const m1 = await mover("1.2", { areaPath: inicial.areaPath });
    registrar("MOVIMENTO 1.1 → 1.2: o card vai para a 1.2 com a esteira informada", m1.card?.etapa === "1.2" && m1.direcao === "avanco" && m1.card?.pbi.areaPath === inicial.areaPath, `card em ${m1.card?.etapa}; gravou ${m1.alteracoes.map((a) => a.rotulo).join(", ")}`);
    registrar("...só o Area Path foi gravado (os demais campos já estavam preenchidos) e Status/Etapa seguem Backlog", m1.alteracoes.length === 1 && m1.card?.pbi.status === "Backlog" && m1.card?.pbi.etapa === "Backlog");
    const t1 = m1.comentario.id ? await textoDoComentario(m1.comentario.id) : "";
    registrar("...comentário traz origem, destino e usuário", t1.includes("1.1 Classificação") && t1.includes("1.2 Priorizar") && t1.includes("Script de teste (T20)"), t1.slice(0, 150));

    // ---- MOVIMENTO 2: 1.2 → 2.1 (+ Assesment) ----
    const revNa12 = (await lerPbiFluxoPoAtual(id)).rev;
    await esperarErro("1.2 → 2.1 sem Data Comitê → 422", 422, () => mover("2.1"), (e) => e.faltas.some((f) => f.includes("Data Comitê")));
    await semMudanca("O bloqueio da 1.2 não gravou nada", revNa12);
    const m2 = await mover("2.1", { dataComite: DATA });
    registrar("MOVIMENTO 1.2 → 2.1: Etapa Comitê, Status Backlog, Data Comitê no formato do Azure", m2.card?.etapa === "2.1" && m2.card?.pbi.etapa === "Comitê" && m2.card?.pbi.status === "Backlog" && m2.card?.pbi.dataComite === DATA_AZURE, `valor lido: ${m2.card?.pbi.dataComite}`);
    const filhos2 = await listarAssesmentsFilhos(id);
    registrar("...Data Comitê copiada para TODOS os Assesments filhos", filhosIniciais.length > 0 ? filhos2.length === filhosIniciais.length && filhos2.every((f) => f.dataComite === DATA_AZURE) : m2.avisos.some((a) => a.includes("sem Assesment filho")), JSON.stringify(filhos2));
    registrar("...resultado informa os Assesments atualizados", filhosIniciais.length === 0 || (m2.assesments?.atualizados.length === filhosIniciais.length && m2.assesments?.falhas.length === 0), JSON.stringify(m2.assesments));
    const t2 = m2.comentario.id ? await textoDoComentario(m2.comentario.id) : "";
    registrar("...comentário traz origem e destino", t2.includes("1.2 Priorizar") && t2.includes("2.1 Comitê"), t2.slice(0, 150));

    // ---- CORRIDA: dois movimentos ao mesmo tempo (2.1 → 3.1 e 2.1 → 3.2) ----
    const corrida = await Promise.allSettled([mover("3.1"), mover("3.2")]);
    const vencedoras = corrida.filter((c) => c.status === "fulfilled");
    const perdedoras = corrida.filter((c) => c.status === "rejected");
    registrar("Corrida: exatamente um dos dois movimentos simultâneos passa", vencedoras.length === 1 && perdedoras.length === 1, corrida.map((c) => (c.status === "fulfilled" ? `OK→${c.value.card?.etapa}` : `recusado ${c.reason?.status}`)).join(" / "));
    registrar("Corrida: o outro é recusado por conflito (409) ou porque a regra já não vale (422)", perdedoras.length === 1 && perdedoras[0].reason instanceof ErroFluxoPo && [409, 422].includes(perdedoras[0].reason.status), perdedoras[0]?.reason?.message ?? "");
    const aposCorrida = await lerPbiFluxoPoAtual(id);
    const ganhou = vencedoras[0]?.value.destino;
    registrar("Corrida: o PBI ficou na etapa do vencedor, uma vez só", derivarEtapa(aposCorrida).etapa === ganhou, `venceu ${ganhou}; PBI em ${derivarEtapa(aposCorrida).etapa}`);
    const comentariosDaCorrida = comentarios.length;

    // ---- MOVIMENTO 3: 2.1 → 3.1 e 2.1 → 3.2 (os dois, em execuções reais) ----
    const outro = ganhou === "3.1" ? "3.2" : "3.1";
    const verifica = (r, etapa, comTag) => r.card?.etapa === etapa && r.card?.pbi.etapa === "Análise" && r.card?.pbi.tags.includes(TAG_PRONTO_REFINAMENTO_TECH) === comTag;
    registrar(`Vencedor da corrida (${ganhou}): ${ganhou === "3.1" ? "Etapa Análise + tag" : "Etapa Análise sem a tag"}`, verifica(vencedoras[0].value, ganhou, ganhou === "3.1"), `tags: "${aposCorrida.tags}"`);
    // volta o PBI para a 2.1 por escrita direta (3.x não volta pela API) e faz o outro destino de verdade
    const atual1 = await lerPbiFluxoPoAtual(id);
    const ops1 = [{ op: "test", path: "/rev", value: atual1.rev }, { op: "add", path: `/fields/${CAMPOS_PBI.etapa}`, value: "Comitê" }];
    if (atual1.tags) ops1.push({ op: "remove", path: `/fields/${CAMPOS_PBI.tags}` });
    await aplicarPatchPbi(id, ops1);
    registrar("(preparo) PBI de volta à 2.1 por escrita direta", derivarEtapa(await lerPbiFluxoPoAtual(id)).etapa === "2.1");
    const m3 = await mover(outro);
    registrar(`MOVIMENTO 2.1 → ${outro}: ${outro === "3.1" ? "Etapa Análise + tag Pronto para refinamento tech" : "Etapa Análise, sem a tag"}`, verifica(m3, outro, outro === "3.1"), `tags: "${m3.card?.pbi.tags}"`);
    registrar("...comentário traz origem e destino", m3.comentario.id ? (await textoDoComentario(m3.comentario.id)).includes(`${outro} `) : false);

    // ---- da 3.x não se movimenta nesta fase ----
    await esperarErro("3.x → 2.1 não é permitido (só exibição) → 422", 422, () => mover("2.1"));
    await esperarErro("3.x → 1.2 não é permitido → 422", 422, () => mover("1.2"));

    // ---- log de TODAS as tentativas (T09) ----
    const { data: linhas, error: erroLog } = await getServiceClient().from("FluxoPoMovimento").select("resultado, origem, destino, direcao").in("usuario", USUARIOS).eq("workItemId", id).gte("criadoEm", INICIO);
    if (erroLog) {
      console.log(`AVISO  Log indisponível (${erroLog.message})`);
    } else {
      const por = {};
      for (const l of linhas) por[l.resultado] = (por[l.resultado] ?? 0) + 1;
      registrar("Log registrou TODAS as tentativas (sucessos, bloqueios, permissão, corrida)", linhas.length === tentativas, `${linhas.length} linhas para ${tentativas} tentativas: ${JSON.stringify(por)}`);
      registrar("Log: avanços, volta, bloqueios e perfil sem permissão", ["sucesso", "bloqueado", "sem_permissao"].every((r) => por[r] > 0) && linhas.some((l) => l.direcao === "volta") && linhas.some((l) => l.direcao === "avanco"));
    }
    // Comentários de transição esperados: volta, 1.1→1.2, 1.2→2.1, vencedor da corrida (4) e depois o outro destino (5). O perdedor da corrida NÃO comenta.
    registrar("Só os movimentos que passaram publicaram comentário (o perdedor da corrida não publicou)", comentariosDaCorrida === 4 && comentarios.length === 5, `${comentariosDaCorrida} após a corrida, ${comentarios.length} no fim`);
  } finally {
    // ---- restauração: comentários primeiro (apagar comentário sobe a revisão), depois PBI e Assesment ----
    for (const cid of comentarios) {
      try {
        await apagarComentarioPbi(id, cid);
      } catch (e) {
        registrar(`Apagar comentário ${cid}`, false, `${e.message} — APAGUE MANUALMENTE`);
      }
    }
    if (precisaRestaurar) {
      for (const f of filhosIniciais) {
        try {
          const atual = (await listarAssesmentsFilhos(id)).find((x) => x.id === f.id);
          if (atual && (atual.dataComite ?? null) !== (f.dataComite ?? null)) await restaurarAssesment(f.id, f.dataComite);
        } catch (e) {
          registrar(`Restaurar Assesment ${f.id}`, false, `${e.message} — RESTAURE MANUALMENTE a Data Comitê para ${f.dataComite ?? "(vazia)"}`);
        }
      }
      const atual = await lerPbiFluxoPoAtual(id); // revisão lida DEPOIS de apagar os comentários
      const ops = [{ op: "test", path: "/rev", value: atual.rev }];
      for (const [k, ref] of [["etapa", CAMPOS_PBI.etapa], ["areaPath", CAMPOS_PBI.areaPath], ["tags", CAMPOS_PBI.tags], ["dataComite", CAMPOS_PBI.dataComite]]) {
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
      const filhosFinais = await listarAssesmentsFilhos(id);
      const igual = JSON.stringify(resumo(final)) === JSON.stringify(resumo(inicial));
      registrar("Estado final do PBI igual ao inicial", igual, igual ? "" : `inicial ${JSON.stringify(resumo(inicial))} | final ${JSON.stringify(resumo(final))}`);
      registrar("Assesments filhos iguais ao inicial", JSON.stringify(filhosFinais) === JSON.stringify(filhosIniciais), JSON.stringify(filhosFinais));
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

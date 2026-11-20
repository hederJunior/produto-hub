// T05 + T06 + T07 + T09 do Fluxo do PO — valida, no PBI DE TESTE, a gravação do movimento de etapa (lib/fluxo-po-servidor.ts),
// o comentário de transição e a replicação da Data Comitê nos Assesments filhos.
//
// Roda a MESMA função que a rota POST /api/fluxo-po/mover usa (sem a camada de login). Ao final, devolve TUDO ao estado
// original (Etapa e Data Comitê do PBI, Data Comitê de cada Assesment filho) e apaga os comentários criados, mesmo se um
// passo falhar. Passos:
//   1. sem gravar: permissão negada (403), destino inválido, campo não permitido, data inválida, Data Comitê ausente,
//      movimento não previsto e conflito de revisão (409);
//   2. 1.2 → 2.1 com a gravação do Assesment SIMULADAMENTE falhando (o PBI tem que ficar movido; falha listada);
//   3. volta 2.1 → 1.2 com a publicação do comentário SIMULADAMENTE falhando (o movimento não pode ser desfeito);
//   4. 1.2 → 2.1 de verdade: formato da data no Azure, comentário publicado, Data Comitê replicada em TODOS os Assesments;
//   5. volta 2.1 → 1.2, confere o log de movimentos (T09: exige a migration aplicada; sem ela só avisa) e restaura.
//
// O PBI precisa estar em 1.2 (Status Backlog, Etapa Backlog, Area Path de uma esteira do KMM5). Só aceita o PBI de teste
// 46766 (o Assesment filho dele, 46767, é gravado e restaurado); outro ID exige FLUXO_PO_PERMITIR_OUTRO_ID=1 — nunca use PBI real.
//
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-testar-mover.mjs 46766

import { ErroFluxoPo, aplicarPatchPbi, apagarComentarioPbi, lerPbiFluxoPoAtual, listarAssesmentsFilhos, moverPbiFluxoPo } from "../lib/fluxo-po-servidor.ts";
import { chaveDia, derivarEtapa } from "../lib/fluxo-po.ts";
import { CAMPOS_ASSESMENT, CAMPOS_PBI } from "../lib/fluxo-po-campos.ts";
import { getServiceClient } from "../lib/supabase.ts";

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

const ORG = process.env.AZURE_DEVOPS_ORG;
const auth = { Authorization: "Basic " + Buffer.from(`:${process.env.AZURE_DEVOPS_PAT}`).toString("base64") };
const comentariosCriados = [];
const INICIO = new Date().toISOString();
let tentativas = 0;
/** Toda tentativa de movimento passa por aqui (para conferir depois que o log registrou todas). */
const mover = (params) => {
  tentativas++;
  return moverPbiFluxoPo(params);
};
const USUARIOS_DO_TESTE = ["script-teste@local", "visitante@local"];
const admin = { email: "script-teste@local", nome: "Script de teste (T05)", tipo: "adm", papel: null };
const semPermissao = { email: "visitante@local", nome: "Visitante", tipo: "user", papel: "CS" };
const resultados = [];
const registrar = (passo, ok, detalhe = "") => {
  resultados.push({ passo, ok });
  console.log(`${ok ? "OK    " : "FALHOU"} ${passo}${detalhe ? ` — ${detalhe}` : ""}`);
};

/** Texto de um comentário do PBI (leitura direta, só para conferir o teste). */
async function textoDoComentario(comentarioId) {
  const r = await fetch(`https://dev.azure.com/${ORG}/KMM5/_apis/wit/workItems/${id}/comments/${comentarioId}?api-version=7.1-preview.4`, { headers: auth });
  return r.ok ? String((await r.json()).text ?? "") : "";
}

/** Restaura a Data Comitê de um Assesment ao valor original (remove o campo se estava vazio). */
async function restaurarAssesment(aid, original) {
  const op = original ? { op: "add", path: `/fields/${CAMPOS_ASSESMENT.dataComite}`, value: original } : { op: "remove", path: `/fields/${CAMPOS_ASSESMENT.dataComite}` };
  const r = await fetch(`https://dev.azure.com/${ORG}/_apis/wit/workitems/${aid}?api-version=7.1`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json", ...auth },
    body: JSON.stringify([op]),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

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
const dataGravada = `${DATA_TESTE}T03:00:00Z`;

async function main() {
  console.log(`PBI de teste: ${id}\n`);
  const inicial = await lerPbiFluxoPoAtual(id);
  const filhosIniciais = await listarAssesmentsFilhos(id);
  console.log("Estado inicial:", JSON.stringify(resumo(inicial)), `| rev ${inicial.rev}`);
  console.log("Assesments filhos:", filhosIniciais.length ? JSON.stringify(filhosIniciais) : "(nenhum)", "\n");
  if (derivarEtapa(inicial).etapa !== "1.2") {
    registrar("Pré-condição: PBI em 1.2", false, `está em ${derivarEtapa(inicial).etapa ?? "fora do quadro"}; deixe Backlog/Backlog numa esteira do KMM5`);
    return;
  }
  let precisaRestaurar = false;

  try {
    // ---- 1. Passos que NÃO gravam ----
    await esperarErro("Sem permissão (perfil CS)", 403, () => mover({ id, destino: "2.1", entrada: { dataComite: DATA_TESTE }, usuario: semPermissao }));
    await esperarErro("Destino inválido", 422, () => mover({ id, destino: "9.9", usuario: admin }));
    await esperarErro("Entrada com campo não permitido", 422, () => mover({ id, destino: "2.1", entrada: { etapa: "Comitê" }, usuario: admin }));
    await esperarErro("Data Comitê inválida", 422, () => mover({ id, destino: "2.1", entrada: { dataComite: "2026-02-31" }, usuario: admin }), (e) => e.faltas.length > 0);
    if (inicial.dataComite) {
      console.log("(PBI já tem Data Comitê; pulando o teste de 'Data Comitê ausente')");
    } else {
      await esperarErro("Data Comitê ausente", 422, () => mover({ id, destino: "2.1", usuario: admin }), (e) => e.faltas.some((f) => f.includes("Data Comitê")));
    }
    await esperarErro("Movimento não previsto (1.2 → 3.1)", 422, () => mover({ id, destino: "3.1", usuario: admin }));
    await esperarErro("Conflito de revisão (test /rev desatualizado)", 409, () =>
      aplicarPatchPbi(id, [{ op: "test", path: "/rev", value: inicial.rev - 1 }, { op: "add", path: `/fields/${CAMPOS_PBI.tags}`, value: "nao-deve-gravar" }]),
    );
    const apos = await lerPbiFluxoPoAtual(id);
    registrar("Nenhum passo recusado gravou nada", apos.rev === inicial.rev, `rev ${inicial.rev} → ${apos.rev}`);

    // ---- 2. Avanço 1.2 → 2.1 com a gravação do Assesment falhando (T07, falha parcial) ----
    precisaRestaurar = true;
    const gravadorQueFalha = async () => {
      throw new Error("falha simulada pelo teste");
    };
    const r0 = await mover({ id, destino: "2.1", entrada: { dataComite: DATA_TESTE }, usuario: admin, gravadorAssesment: gravadorQueFalha });
    if (r0.comentario?.id) comentariosCriados.push(r0.comentario.id);
    registrar("Falha ao gravar Assesment NÃO desfaz o movimento do PBI", r0.card?.etapa === "2.1", `card em ${r0.card?.etapa}`);
    if (filhosIniciais.length) {
      registrar("Falha do Assesment listada no resultado e nos avisos", r0.assesments?.falhas.length === filhosIniciais.length && r0.avisos.some((a) => a.includes("não foi replicada")), `avisos: ${r0.avisos.join(" | ")}`);
    }

    // ---- 3. Volta 2.1 → 1.2 com o comentário falhando (T06) ----
    const falhaDeComentario = async () => {
      throw new ErroFluxoPo(502, "simulado", "falha simulada pelo teste");
    };
    const rv = await mover({ id, destino: "1.2", usuario: admin, publicador: falhaDeComentario });
    registrar("Comentário com falha NÃO desfaz o movimento (aviso, publicado=false)", rv.card?.etapa === "1.2" && rv.comentario?.publicado === false && rv.avisos.some((a) => a.includes("comentário")), `avisos: ${rv.avisos.join(" | ")}`);
    registrar("Volta 2.1 → 1.2 (proposta) mantém a Data Comitê", rv.direcao === "volta" && rv.proposta === true && rv.card?.pbi.dataComite === dataGravada);

    // ---- 4. Avanço 1.2 → 2.1 de verdade ----
    const r1 = await mover({ id, destino: "2.1", usuario: admin });
    if (r1.comentario?.id) comentariosCriados.push(r1.comentario.id);
    registrar("Mover 1.2 → 2.1 (200)", r1.card?.etapa === "2.1" && r1.direcao === "avanco", `card em ${r1.card?.etapa}; gravou ${r1.alteracoes.map((a) => a.rotulo).join(", ") || "(só replicação)"}`);
    registrar("Data Comitê salva no formato do Azure (meia-noite de Brasília)", r1.card?.pbi.dataComite === dataGravada, `valor lido: ${r1.card?.pbi.dataComite}`);
    registrar("Mesmo dia na leitura (chaveDia) e Status Backlog / Etapa Comitê", chaveDia(r1.card?.pbi.dataComite) === DATA_TESTE && r1.card?.pbi.status === "Backlog" && r1.card?.pbi.etapa === "Comitê");
    registrar("Comentário de transição publicado", r1.comentario?.publicado === true, `id ${r1.comentario?.id}`);
    const texto = r1.comentario?.id ? await textoDoComentario(r1.comentario.id) : "";
    registrar("Comentário traz origem, destino e usuário", texto.includes("1.2 Priorizar") && texto.includes("2.1 Comitê") && texto.includes("Script de teste (T05)"), `texto: ${texto.slice(0, 200)}`);
    if (r1.avisos.length) console.log("       avisos:", r1.avisos.join(" | "));

    // ---- 4b. Replicação nos Assesments (T07) ----
    const filhosAgora = await listarAssesmentsFilhos(id);
    if (!filhosIniciais.length) {
      registrar("PBI sem Assesment filho: avisa e segue", r1.assesments?.total === 0 && r1.avisos.some((a) => a.includes("sem Assesment filho")), `avisos: ${r1.avisos.join(" | ")}`);
    } else {
      registrar("Data Comitê replicada em TODOS os Assesments filhos", filhosAgora.length === filhosIniciais.length && filhosAgora.every((f) => f.dataComite === dataGravada), JSON.stringify(filhosAgora));
      registrar("Resultado informa os Assesments atualizados", r1.assesments?.atualizados.length === filhosIniciais.length && r1.assesments?.falhas.length === 0, JSON.stringify(r1.assesments));
    }

    // ---- 5. Volta final ----
    const r2 = await mover({ id, destino: "1.2", usuario: admin });
    if (r2.comentario?.id) comentariosCriados.push(r2.comentario.id);
    registrar("Voltar 2.1 → 1.2 (200)", r2.card?.etapa === "1.2" && r2.direcao === "volta" && r2.proposta === true, `card em ${r2.card?.etapa}`);

    // ---- 5b. Log de movimentos (T09) ----
    const { data: linhas, error: erroLog } = await getServiceClient()
      .from("FluxoPoMovimento")
      .select("resultado, origem, destino, usuario, motivo")
      .in("usuario", USUARIOS_DO_TESTE)
      .eq("workItemId", id)
      .gte("criadoEm", INICIO);
    if (erroLog) {
      console.log(`AVISO  Log de movimentos indisponível (${erroLog.message}) — a migration 20261120120000_fluxo_po já foi aplicada no Supabase?`);
    } else {
      const por = {};
      for (const l of linhas) por[l.resultado] = (por[l.resultado] ?? 0) + 1;
      registrar("Log registrou TODAS as tentativas (bloqueadas, sem permissão e com falha parcial inclusive)", linhas.length === tentativas, `${linhas.length} linhas para ${tentativas} tentativas: ${JSON.stringify(por)}`);
      registrar("Log tem sucesso, parcial, bloqueado e sem_permissão", ["sucesso", "parcial", "bloqueado", "sem_permissao"].every((r) => por[r] > 0));
      const dos403 = linhas.find((l) => l.resultado === "sem_permissao");
      registrar("Linha do bloqueio traz usuário e motivo", !!dos403?.motivo && dos403.usuario === "visitante@local", dos403?.motivo ?? "");
      // Limpeza: as linhas de teste não ficam no log de verdade.
      const { error: erroDel } = await getServiceClient().from("FluxoPoMovimento").delete().in("usuario", USUARIOS_DO_TESTE).eq("workItemId", id).gte("criadoEm", INICIO);
      registrar("Linhas de teste removidas do log", !erroDel, erroDel?.message ?? "");
    }
  } finally {
    // ---- 6. Limpeza dos comentários e restauração do estado original ----
    for (const cid of comentariosCriados) {
      try {
        await apagarComentarioPbi(id, cid);
        registrar(`Apagar comentário de teste ${cid}`, (await textoDoComentario(cid)) === "");
      } catch (e) {
        registrar(`Apagar comentário de teste ${cid}`, false, `${e.message} — APAGUE MANUALMENTE`);
      }
    }
    if (precisaRestaurar) {
      for (const f of filhosIniciais) {
        try {
          const atuais = await listarAssesmentsFilhos(id);
          const atual = atuais.find((x) => x.id === f.id);
          if (atual && (atual.dataComite ?? null) !== (f.dataComite ?? null)) await restaurarAssesment(f.id, f.dataComite);
        } catch (e) {
          registrar(`Restaurar Assesment ${f.id}`, false, `${e.message} — RESTAURE MANUALMENTE a Data Comitê para ${f.dataComite ?? "(vazia)"}`);
        }
      }
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
          registrar("Restaurar o PBI", false, `${e.message} — RESTAURE O PBI ${id} MANUALMENTE: Etapa "${inicial.etapa}", Data Comitê ${inicial.dataComite ?? "(vazia)"}`);
        }
      }
      const final = await lerPbiFluxoPoAtual(id);
      const filhosFinais = await listarAssesmentsFilhos(id);
      const igualPbi = JSON.stringify(resumo(final)) === JSON.stringify(resumo(inicial));
      const igualFilhos = JSON.stringify(filhosFinais) === JSON.stringify(filhosIniciais);
      registrar("Estado final do PBI igual ao inicial", igualPbi, igualPbi ? "" : `inicial ${JSON.stringify(resumo(inicial))} | final ${JSON.stringify(resumo(final))}`);
      registrar("Assesments filhos iguais ao inicial", igualFilhos, igualFilhos ? "" : `inicial ${JSON.stringify(filhosIniciais)} | final ${JSON.stringify(filhosFinais)}`);
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

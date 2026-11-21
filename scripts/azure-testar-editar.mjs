// T16 do Fluxo do PO — valida a edição das informações do PBI (editarInformacoesPbi) e as listas de valores no PBI DE TESTE.
// Roda as MESMAS funções da rota PATCH/GET /api/fluxo-po/pbi/{id}/informacoes (sem a camada de login). Ao final devolve o PBI e o
// Assesment filho ao estado original e apaga as linhas de log do teste, mesmo se um passo falhar.
// Passos sem gravar: 403, sem campo, Area Path vazio/fora do KMM5, data inválida, valor fora da lista do Azure, sem mudanças.
// Passos gravando: Classificação e Cliente, Area Path (troca o card de coluna), Data Comitê (copiada para o Assesment) e limpar a data.
//
// O PBI precisa estar em 1.2 ou 2.1 (no quadro). Só aceita o PBI de teste 46766 (e o Assesment filho dele, 46767).
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-testar-editar.mjs 46766
import { ErroFluxoPo, aplicarPatchPbi, editarInformacoesPbi, lerInformacoesPbi, lerPbiFluxoPoAtual, listarAssesmentsFilhos } from "../lib/fluxo-po-servidor.ts";
import { chaveDia } from "../lib/fluxo-po.ts";
import { CAMPOS_ASSESMENT, CAMPOS_PBI } from "../lib/fluxo-po-campos.ts";
import { getServiceClient } from "../lib/supabase.ts";

const PBI_DE_TESTE = 46766;
const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
  console.error("Informe o ID do PBI de teste: ... scripts/azure-testar-editar.mjs 46766");
  process.exit(1);
}
if (id !== PBI_DE_TESTE && process.env.FLUXO_PO_PERMITIR_OUTRO_ID !== "1") {
  console.error(`Recusado: este script só grava no PBI de teste ${PBI_DE_TESTE} (outro ID exige FLUXO_PO_PERMITIR_OUTRO_ID=1 — nunca use PBI real).`);
  process.exit(1);
}

const ORG = process.env.AZURE_DEVOPS_ORG;
const auth = { Authorization: "Basic " + Buffer.from(`:${process.env.AZURE_DEVOPS_PAT}`).toString("base64") };
const admin = { email: "script-teste@local", nome: "Script de teste (T16)", tipo: "adm", papel: null };
const cs = { email: "visitante@local", nome: "Visitante", tipo: "user", papel: "CS" };
const USUARIOS = ["script-teste@local", "visitante@local"];
const INICIO = new Date().toISOString();
const resultados = [];
let tentativas = 0;
const registrar = (passo, ok, detalhe = "") => {
  resultados.push({ passo, ok });
  console.log(`${ok ? "OK    " : "FALHOU"} ${passo}${detalhe ? ` — ${detalhe}` : ""}`);
};
const editar = (entrada, usuario = admin, extra = {}) => {
  tentativas++;
  return editarInformacoesPbi({ id, entrada, usuario, ...extra });
};
async function esperarErro(passo, status, fn, conferir) {
  try {
    await fn();
    registrar(passo, false, "deveria ter sido recusado, mas passou");
  } catch (e) {
    registrar(passo, e instanceof ErroFluxoPo && e.status === status && (conferir ? conferir(e) : true), e instanceof ErroFluxoPo ? `HTTP ${e.status} (${e.codigo}): ${e.message}${e.faltas.length ? ` | ${e.faltas.join(" / ")}` : ""}` : String(e));
  }
}
const resumo = (p) => ({ areaPath: p.areaPath, cliente: p.cliente, classificacao: p.classificacao, dataAberturaProduto: p.dataAberturaProduto, dataComite: p.dataComite, etapa: p.etapa, status: p.status, tags: p.tags });

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
  const infoInicial = await lerInformacoesPbi(id);
  if (!infoInicial.card) {
    registrar("Pré-condição: PBI no quadro (1.2 ou 2.1)", false, "o PBI não está em nenhuma etapa do fluxo");
    return;
  }
  registrar("Leitura das informações: card e listas do Azure", !!infoInicial.card && infoInicial.listas.classificacoes.length === 12 && infoInicial.listas.clientes.length > 100 && infoInicial.listas.esteiras.length >= 10, `etapa ${infoInicial.card.etapa}; ${infoInicial.listas.classificacoes.length} classificações, ${infoInicial.listas.clientes.length} clientes, ${infoInicial.listas.esteiras.length} esteiras${infoInicial.listas.aviso ? ` | AVISO: ${infoInicial.listas.aviso}` : ""}`);
  registrar("Cliente do PBI está na lista do Azure", infoInicial.listas.clientes.includes(inicial.cliente), inicial.cliente);
  const classOutra = infoInicial.listas.classificacoes.find((c) => c !== inicial.classificacao);
  const clienteOutro = infoInicial.listas.clientes.find((c) => c !== inicial.cliente);

  let precisaRestaurar = false;
  try {
    // ---- sem gravar ----
    await esperarErro("Sem permissão (perfil CS) → 403", 403, () => editar({ cliente: clienteOutro }, cs));
    await esperarErro("Nenhum campo informado → 422", 422, () => editar({}));
    await esperarErro("Campo que não pode ser editado (etapa) → 422", 422, () => editar({ etapa: "Comitê" }));
    await esperarErro("Area Path vazio → 422", 422, () => editar({ areaPath: "" }), (e) => e.faltas.length > 0);
    await esperarErro("Area Path fora do KMM5 → 422", 422, () => editar({ areaPath: "KMM4\\TMS - Rangers" }), (e) => e.faltas.length > 0);
    await esperarErro("Data Comitê inexistente (31/02) → 422", 422, () => editar({ dataComite: "2026-02-31" }), (e) => e.faltas.length > 0);
    await esperarErro("Valor fora da lista do Azure (Classificação) → 422 com a mensagem do Azure", 422, () => editar({ classificacao: "Classificação Inventada" }), (e) => /Azure/.test(e.message));
    const semMudar = await editar({ cliente: inicial.cliente, classificacao: inicial.classificacao });
    registrar("Valores iguais aos atuais: 'sem mudanças', nada gravado", semMudar.semMudancas && semMudar.alteracoes.length === 0, semMudar.avisos.join(" | "));
    const apos = await lerPbiFluxoPoAtual(id);
    registrar("Nenhum passo recusado nem o 'sem mudanças' alterou o PBI", apos.rev === inicial.rev, `rev ${inicial.rev} → ${apos.rev}`);

    // ---- gravando ----
    precisaRestaurar = true;
    const r1 = await editar({ classificacao: classOutra, cliente: clienteOutro });
    registrar("Editar Classificação e Cliente (lista do Azure)", !r1.semMudancas && r1.pbi.classificacao === classOutra && r1.pbi.cliente === clienteOutro, `${inicial.classificacao}→${classOutra}; ${inicial.cliente}→${clienteOutro}`);
    registrar("...e só esses dois campos foram gravados", r1.alteracoes.map((a) => a.rotulo).sort().join(",") === "Classificação,Cliente");

    const r2 = await editar({ areaPath: "KMM5" });
    registrar("Area Path para a raiz KMM5: o card vai para a 1.1 e avisa", r2.card?.etapa === "1.1" && r2.avisos.some((a) => a.includes("1.1")), `${r2.card?.etapa} | ${r2.avisos.join(" | ")}`);
    const r3 = await editar({ areaPath: inicial.areaPath });
    registrar("Area Path de volta para a esteira: o card volta para a 1.2", r3.card?.etapa === infoInicial.card.etapa && r3.pbi.areaPath === inicial.areaPath, `${r3.card?.etapa}`);

    const r4 = await editar({ dataComite: "2031-12-31" });
    registrar("Data Comitê gravada no formato do Azure", r4.pbi.dataComite === "2031-12-31T03:00:00Z", String(r4.pbi.dataComite));
    const filhos4 = await listarAssesmentsFilhos(id);
    registrar("Data Comitê copiada para TODOS os Assesments filhos", filhosIniciais.length === 0 ? r4.avisos.some((a) => a.includes("sem Assesment filho")) : filhos4.length === filhosIniciais.length && filhos4.every((f) => f.dataComite === "2031-12-31T03:00:00Z"), JSON.stringify(filhos4));

    const r5 = await editar({ dataComite: "" });
    registrar("Limpar a Data Comitê: PBI sem data, Assesments mantêm a anterior e há aviso", r5.pbi.dataComite === null && r5.assesments === null && r5.avisos.some((a) => a.includes("mantêm")), r5.avisos.join(" | "));
    const filhos5 = await listarAssesmentsFilhos(id);
    registrar("...Assesments continuam com a data", filhosIniciais.length === 0 || filhos5.every((f) => f.dataComite === "2031-12-31T03:00:00Z"));

    const gravadorQueFalha = async () => {
      throw new Error("falha simulada pelo teste");
    };
    const r6 = await editar({ dataComite: "2031-12-30" }, admin, { gravadorAssesment: gravadorQueFalha });
    registrar("Falha ao gravar o Assesment NÃO desfaz a edição do PBI (aviso com a falha)", r6.pbi.dataComite === "2031-12-30T03:00:00Z" && (filhosIniciais.length === 0 || (r6.assesments?.falhas.length === filhosIniciais.length && r6.avisos.some((a) => a.includes("não foi replicada")))), r6.avisos.join(" | "));

    // ---- log (T09): toda tentativa, edições e recusas ----
    const { data: linhas, error: erroLog } = await getServiceClient().from("FluxoPoMovimento").select("resultado, direcao, usuario, motivo").in("usuario", USUARIOS).eq("workItemId", id).gte("criadoEm", INICIO);
    if (erroLog) console.log(`AVISO  Log indisponível (${erroLog.message})`);
    else {
      const por = {};
      for (const l of linhas) por[l.resultado] = (por[l.resultado] ?? 0) + 1;
      // O "sem mudanças" não gera linha (nada foi alterado): todas as demais tentativas entram.
      registrar("Log registrou todas as tentativas (menos o 'sem mudanças')", linhas.length === tentativas - 1, `${linhas.length} linhas para ${tentativas} tentativas: ${JSON.stringify(por)}`);
      registrar("Log: edições com direção 'edicao', e recusas (sem permissão, bloqueado) registradas", linhas.every((l) => l.direcao === "edicao") && ["sucesso", "parcial", "bloqueado", "sem_permissao"].every((r) => por[r] > 0));
    }
  } finally {
    if (precisaRestaurar) {
      for (const f of filhosIniciais) {
        try {
          const atual = (await listarAssesmentsFilhos(id)).find((x) => x.id === f.id);
          if (atual && (atual.dataComite ?? null) !== (f.dataComite ?? null)) await restaurarAssesment(f.id, f.dataComite);
        } catch (e) {
          registrar(`Restaurar Assesment ${f.id}`, false, `${e.message} — RESTAURE MANUALMENTE a Data Comitê para ${f.dataComite ?? "(vazia)"}`);
        }
      }
      const atual = await lerPbiFluxoPoAtual(id);
      const ops = [{ op: "test", path: "/rev", value: atual.rev }];
      const campos = [["areaPath", CAMPOS_PBI.areaPath], ["cliente", CAMPOS_PBI.cliente], ["classificacao", CAMPOS_PBI.classificacao], ["dataAberturaProduto", CAMPOS_PBI.dataAberturaProduto], ["dataComite", CAMPOS_PBI.dataComite]];
      for (const [k, ref] of campos) {
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
      const igualPbi = JSON.stringify(resumo(final)) === JSON.stringify(resumo(inicial));
      registrar("Estado final do PBI igual ao inicial", igualPbi, igualPbi ? "" : `inicial ${JSON.stringify(resumo(inicial))} | final ${JSON.stringify(resumo(final))}`);
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

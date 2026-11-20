// T08 do Fluxo do PO — SOMENTE LEITURA: mostra descrição, comentários, anexos e histórico de um PBI do KMM5, do jeito
// que as rotas GET /api/fluxo-po/pbi/{id}/{parte} devolvem (mesmas funções, sem a camada de login).
// Uso: node --use-system-ca --env-file=.env --import ./scripts/registrar-ts.mjs scripts/azure-ler-detalhe.mjs <ID_DO_PBI>
import { ErroFluxoPo } from "../lib/fluxo-po-servidor.ts";
import { lerAnexosPbi, lerComentariosPbi, lerDescricaoPbi, lerHistoricoPbi } from "../lib/fluxo-po-detalhe-servidor.ts";

const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
  console.error("Informe o ID de um PBI do KMM5.");
  process.exit(1);
}

const corta = (s, n = 300) => (s.length > n ? `${s.slice(0, n)}… (${s.length} caracteres)` : s);

for (const [nome, fn] of [["descricao", lerDescricaoPbi], ["comentarios", lerComentariosPbi], ["anexos", lerAnexosPbi], ["historico", lerHistoricoPbi]]) {
  console.log(`\n===== ${nome} =====`);
  try {
    const r = await fn(id);
    if (nome === "descricao") console.log(`vazia=${r.vazia} truncada=${r.truncada}\n${corta(r.html, 600)}`);
    else if (nome === "comentarios") {
      console.log(`total=${r.total} devolvidos=${r.comentarios.length} truncado=${r.truncado}`);
      for (const c of r.comentarios.slice(0, 3)) console.log(`- #${c.id} ${c.autor} em ${c.quando}${c.editadoEm ? ` (editado ${c.editadoEm})` : ""}: ${corta(c.html, 200)}`);
    } else if (nome === "anexos") {
      console.log(`anexos=${r.anexos.length} truncado=${r.truncado}`);
      for (const a of r.anexos) console.log(`- ${a.nome} | ${a.tamanho} bytes | ${a.autor} em ${a.quando} | ${a.link}`);
    } else {
      console.log(`entradas=${r.entradas.length} truncado=${r.truncado}`);
      for (const e of r.entradas.slice(0, 6)) console.log(`- rev ${e.rev} ${e.quando} ${e.usuario}: ${e.mudancas.map((m) => `${m.campo}: ${m.de ?? "∅"} → ${m.para ?? "∅"}`).join("; ")}`);
    }
  } catch (e) {
    console.log(e instanceof ErroFluxoPo ? `ERRO ${e.status} (${e.codigo}): ${e.message}` : `ERRO inesperado: ${e.message}`);
  }
}

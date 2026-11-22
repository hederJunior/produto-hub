"use client";

import type { ReactNode } from "react";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import { C } from "@/lib/kmm-theme";
import { formatarChaveDia } from "@/lib/datas";
import { rotuloDaArea } from "@/lib/fluxo-po";

/** Os campos do PBI que o Fluxo do PO edita (no detalhe) ou pede para preencher (na confirmação de mover). */
export type Campo = "cliente" | "classificacao" | "areaPath" | "dataAberturaProduto" | "dataComite";

/** Listas de valores do Azure DevOps (`/api/fluxo-po/listas` e `/api/fluxo-po/pbi/<id>/informacoes`). */
export type Listas = { classificacoes: string[]; clientes: string[]; esteiras: { valor: string; rotulo: string }[]; aviso: string | null };

export const ROTULO_CAMPO: Record<Campo, string> = {
  cliente: "Cliente",
  classificacao: "Classificação",
  areaPath: "Area Path (esteira)",
  dataAberturaProduto: "Data Abertura Produto",
  dataComite: "Data Comitê",
};

/**
 * Um campo editável: lista do Azure (Cliente com busca, Classificação, esteiras), data ou texto; somente leitura se não puder
 * editar. Usado no quadro de informações do detalhe e no formulário da confirmação de mover.
 * `semRaiz`: no Area Path, não oferece "KMM5 (sem esteira)" (a confirmação exige uma esteira de verdade).
 * `marcarAlterado`: mostra o selo "alterado" quando o valor difere do original.
 */
export function CampoInformacao({
  campo,
  valor,
  original,
  editavel,
  listas,
  aoMudar,
  semRaiz = false,
  marcarAlterado = true,
}: {
  campo: Campo;
  valor: string;
  original: string;
  editavel: boolean;
  listas: Listas;
  aoMudar: (v: string) => void;
  semRaiz?: boolean;
  marcarAlterado?: boolean;
}) {
  const alterado = marcarAlterado && valor !== original;
  const rotulo = ROTULO_CAMPO[campo];
  const ehData = campo === "dataAberturaProduto" || campo === "dataComite";

  let leitura = valor || "—";
  if (ehData && valor) leitura = formatarChaveDia(valor);
  if (campo === "areaPath") leitura = rotuloDaArea(valor);

  let controle: ReactNode;
  if (!editavel) {
    controle = <div style={{ fontSize: 14, color: valor ? C.text : C.faint, padding: "8px 0" }}>{leitura}</div>;
  } else if (campo === "cliente") {
    // Valor atual fora da lista do Azure (legado) continua selecionável, para não sumir do campo.
    const opcoes = valor && !listas.clientes.includes(valor) ? [valor, ...listas.clientes] : listas.clientes;
    controle = (
      <div>
        <MultiSelectFiltro rotuloTodos="Selecione o cliente" opcoes={opcoes} selecionados={valor ? [valor] : []} onChange={(v) => aoMudar(v[0] ?? "")} pesquisavel unico placeholderBusca="Digite o nome do cliente…" />
        {valor && (
          <button type="button" onClick={() => aoMudar("")} style={{ marginTop: 4, border: "none", background: "transparent", color: C.muted, fontSize: 11.5, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
            Limpar cliente
          </button>
        )}
      </div>
    );
  } else if (campo === "classificacao") {
    const opcoes = valor && !listas.classificacoes.includes(valor) ? [valor, ...listas.classificacoes] : listas.classificacoes;
    controle = (
      <select className="kmm-input" value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">— sem classificação —</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  } else if (campo === "areaPath") {
    const raiz = { valor: "KMM5", rotulo: "KMM5 (sem esteira)" };
    const opcoes = semRaiz ? listas.esteiras : [raiz, ...listas.esteiras];
    const conhecida = opcoes.some((o) => o.valor === valor) || (semRaiz && (valor === "" || valor === "KMM5"));
    controle = (
      <select className="kmm-input" value={semRaiz && valor === "KMM5" ? "" : valor} onChange={(e) => aoMudar(e.target.value)}>
        {semRaiz && <option value="">— selecione a esteira —</option>}
        {!conhecida && <option value={valor}>{valor}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>{o.rotulo}</option>
        ))}
      </select>
    );
  } else {
    controle = <input className="kmm-input" type="date" value={valor} onChange={(e) => aoMudar(e.target.value)} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".03em" }}>{rotulo}</span>
        {alterado && <span style={{ fontSize: 10.5, fontWeight: 600, color: C.orange, background: "#FFF1EA", borderRadius: 999, padding: "0 7px" }}>alterado</span>}
      </div>
      {controle}
    </div>
  );
}

"use client";

import { useProduto } from "@/components/ProdutoContext";
import { C, PASTEL } from "@/lib/kmm-theme";
import { ETAPAS_FLUXO } from "@/lib/fluxo-po";

const CORES = [PASTEL.sky, PASTEL.indigo, PASTEL.purple, PASTEL.amber, PASTEL.orange, PASTEL.green] as const;

/**
 * Aba Upstream do Fluxo do PO. Nesta entrega (menu e abas) mostra só a estrutura da esteira; o quadro com os cards
 * (leitura em /api/fluxo-po/upstream) entra na tarefa seguinte. O fluxo existe apenas no KMM5: com KMM4 selecionado
 * a tela avisa (mesmo padrão do Kanban do Upstream).
 */
export default function FluxoPoUpstream() {
  const { produto } = useProduto();

  if (produto === "KMM4") {
    return (
      <div className="kmm-card" style={{ fontSize: 13, color: "#8a5a00", background: "#fff6e0" }}>
        O Fluxo do PO existe só no KMM5. Selecione KMM5 (ou Ambos) no filtro Produto para ver a esteira.
      </div>
    );
  }

  return (
    <div className="kmm-card" style={{ padding: "18px 20px" }}>
      <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 15, color: C.text }}>Esteira de requisições de clientes</div>
      <p style={{ margin: "3px 0 14px", fontSize: 13, color: C.muted }}>
        Cada card ocupa a etapa que os campos do PBI indicam (Status, Etapa, Area Path e tags). O quadro com os cards será habilitado em
        breve{produto === "AMBOS" ? "; o fluxo usa somente o KMM5" : ""}.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ETAPAS_FLUXO.map((e, i) => (
          <span
            key={e.codigo}
            title={e.movimenta ? "Etapa com movimento" : "Somente exibição nesta fase"}
            style={{ background: CORES[i].bg, color: CORES[i].dot, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 600 }}
          >
            {e.codigo} {e.nome}
            {!e.movimenta && <span style={{ fontWeight: 400, opacity: 0.8 }}> · só exibição</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

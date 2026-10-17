"use client";

import { C } from "@/lib/kmm-theme";
import { norm, type PbiGestaoCliente } from "@/lib/gestao-clientes";

/**
 * Painel "Distribuição por status" da Gestão de clientes (pedido por Heder em 2026-10-17), ao lado
 * da tabela: uma linha por status do board (ponto colorido, nome, quantidade, % e barra). Conta os
 * PBIs JÁ filtrados (cliente/squad), então acompanha a tabela. As linhas são os 5 status que a tela
 * carrega (ESTADOS_GESTAO_CLIENTES); "HML c/ cliente" = Teste Aceite Usuário e "Ag. Deploy" =
 * Aguardando Deploy (rótulos curtos do desenho de referência).
 */
const LINHAS: { estado: string; rotulo: string; cor: string }[] = [
  { estado: "Backlog", rotulo: "Backlog", cor: "#64748B" },
  { estado: "Orçamento", rotulo: "Orçamento", cor: "#6366F1" },
  { estado: "Execução", rotulo: "Execução", cor: "#0EA5E9" },
  { estado: "Teste Aceite Usuário", rotulo: "HML c/ cliente", cor: "#F59E0B" },
  { estado: "Aguardando Deploy", rotulo: "Ag. Deploy", cor: "#A855F7" },
];

export default function DistribuicaoPorStatus({ itens, carregando }: { itens: PbiGestaoCliente[]; carregando: boolean }) {
  const total = itens.length;
  const linhas = LINHAS.map((l) => {
    const qtd = itens.filter((p) => norm(p.state) === norm(l.estado)).length;
    return { ...l, qtd, pct: total ? Math.round((qtd / total) * 100) : 0 };
  });

  return (
    <div className="kmm-card" style={{ padding: "20px 22px" }}>
      <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 700, fontSize: 17, color: C.text }}>Distribuição por status</div>
      <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>Volume de demandas por etapa da esteira.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 22 }}>
        {linhas.map((l) => (
          <div key={l.estado} title={l.estado}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: l.cor, flexShrink: 0 }} />
              <span style={{ fontSize: 15, color: C.text, flex: 1 }}>{l.rotulo}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{carregando ? "…" : l.qtd}</span>
              <span style={{ fontSize: 12.5, color: C.muted, minWidth: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {carregando ? "" : `${l.pct}%`}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${l.rotulo}: ${l.qtd} de ${total}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={l.pct}
              style={{ height: 8, borderRadius: 999, background: "#EFF1F7", marginTop: 8, overflow: "hidden" }}
            >
              <div style={{ width: carregando ? 0 : `${l.pct}%`, height: "100%", borderRadius: 999, background: l.cor, transition: "width .3s ease" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

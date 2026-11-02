"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, corDeAreaTabela } from "@/lib/kmm-theme";
import { chaveDia, diasEntreChaves, formatarChaveDia } from "@/lib/datas";
import { DIAS_ALERTA_REFINAMENTO, nomeDaSquad, type ItemRefinamento } from "@/lib/backlog";

const ORG_DEVOPS = "kmmbynstech";

// id | Título | Cliente | PO | Classificação | Created Date | Data Comitê | Aging
const COLUNAS = "64px minmax(240px, 2.4fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(120px, 1fr) 104px 104px 130px";

/**
 * Backlog > "Refinamento Tech": lista de PBIs agrupada por Squad (Area Path, cor registrada da
 * Área), mesmo modelo da lista de "Backlog Carteira". Aging = dias desde a Data de Comitê até hoje;
 * acima de DIAS_ALERTA_REFINAMENTO dias ganha o indicador vermelho.
 */
export default function RefinamentoTech({ itens, hoje }: { itens: ItemRefinamento[]; hoje: Date }) {
  const [recolhidos, setRecolhidos] = useState<Record<string, boolean>>({});
  const hojeChave = chaveDia(hoje);

  const grupos = useMemo(() => {
    const porArea = new Map<string, ItemRefinamento[]>();
    for (const i of itens) porArea.set(i.areaPath, [...(porArea.get(i.areaPath) ?? []), i]);
    return Array.from(porArea.entries())
      .map(([areaPath, doGrupo]) => ({
        areaPath,
        squad: nomeDaSquad(areaPath),
        itens: doGrupo.sort((a, b) => a.id - b.id),
        cor: corDeAreaTabela(areaPath),
      }))
      .sort((a, b) => a.squad.localeCompare(b.squad, "pt-BR"));
  }, [itens]);

  const celula: React.CSSProperties = { padding: "10px 10px", fontSize: 12.5, display: "flex", alignItems: "center", minWidth: 0, color: C.text };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: C.muted }}>
        {itens.length} {itens.length === 1 ? "item" : "itens"} em Backlog, etapa Análise, com a tag &ldquo;Pronto para refinamento tech&rdquo;
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1100 }}>
          <div style={{ display: "grid", gridTemplateColumns: COLUNAS, padding: "10px 0", marginBottom: 6, fontSize: 11.5, fontWeight: 600, color: "#7A7680", background: "#F5F4F8", borderRadius: 10 }}>
            {["ID", "Título", "Cliente", "PO", "Classificação", "Created Date", "Data Comitê", "Aging"].map((h) => (
              <div key={h} style={{ padding: "0 10px" }}>
                {h}
              </div>
            ))}
          </div>

          {grupos.map((g) => {
            const aberto = !recolhidos[g.areaPath];
            return (
              <section key={g.areaPath} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0 8px", borderTop: `1px solid ${C.border}` }}>
                  <button
                    type="button"
                    onClick={() => setRecolhidos((r) => ({ ...r, [g.areaPath]: aberto }))}
                    aria-expanded={aberto}
                    title={aberto ? "Comprimir" : "Expandir"}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 2 }}
                  >
                    <ChevronDown size={16} style={{ transform: aberto ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                  </button>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      background: "#F5F4F8",
                      color: C.text,
                      fontFamily: "Sora,sans-serif",
                      fontWeight: 600,
                      fontSize: 12.5,
                      padding: "4px 12px",
                      borderRadius: 999,
                    }}
                  >
                    <i style={{ width: 8, height: 8, borderRadius: "50%", background: g.cor.bg }} />
                    {g.squad}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{g.itens.length}</span>
                </div>

                {aberto &&
                  g.itens.map((i) => {
                    const dias = i.dataComite ? Math.max(0, diasEntreChaves(chaveDia(i.dataComite), hojeChave)) : null;
                    const atrasado = dias != null && dias > DIAS_ALERTA_REFINAMENTO;
                    return (
                      <div key={i.id} style={{ display: "grid", gridTemplateColumns: COLUNAS, borderTop: `1px solid ${C.border}`, alignItems: "center" }}>
                        <div style={{ ...celula, fontVariantNumeric: "tabular-nums" }}>
                          <a
                            href={`https://dev.azure.com/${ORG_DEVOPS}/${encodeURIComponent(i.areaPath.split("\\")[0])}/_workitems/edit/${i.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir o PBI no Azure DevOps"
                            style={{ color: C.blue, textDecoration: "none", fontWeight: 500 }}
                          >
                            {i.id}
                          </a>
                        </div>
                        <div style={{ ...celula, fontWeight: 600 }} title={i.titulo}>
                          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i.titulo}</span>
                        </div>
                        <div style={celula}>{i.cliente || "—"}</div>
                        <div style={{ ...celula, color: C.muted }}>{i.po || "—"}</div>
                        <div style={celula}>{i.classificacao || "—"}</div>
                        <div style={{ ...celula, fontVariantNumeric: "tabular-nums" }}>{i.createdDate ? formatarChaveDia(chaveDia(i.createdDate)) : "—"}</div>
                        <div style={{ ...celula, fontVariantNumeric: "tabular-nums" }}>{i.dataComite ? formatarChaveDia(chaveDia(i.dataComite)) : "—"}</div>
                        <div
                          style={{ ...celula, gap: 8, fontVariantNumeric: "tabular-nums", ...(atrasado ? { color: C.red, fontWeight: 700 } : {}) }}
                          title={dias != null ? `${dias} dias desde a Data de Comitê${atrasado ? ` (mais de ${DIAS_ALERTA_REFINAMENTO})` : ""}` : "Sem Data de Comitê"}
                        >
                          {atrasado && (
                            <span
                              role="img"
                              aria-label={`Há ${dias} dias neste status`}
                              style={{ width: 12, height: 12, borderRadius: "50%", background: C.red, boxShadow: "0 0 0 3px #FBE7E4", display: "inline-block", flexShrink: 0 }}
                            />
                          )}
                          {dias != null ? `${dias} ${dias === 1 ? "dia" : "dias"}` : "—"}
                        </div>
                      </div>
                    );
                  })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

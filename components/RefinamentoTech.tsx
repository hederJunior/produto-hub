"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, corDeAreaTabela } from "@/lib/kmm-theme";
import { chaveDia, diasEntreChaves, formatarChaveDia } from "@/lib/datas";
import { DIAS_ALERTA_REFINAMENTO, nomeDaSquad, type ItemRefinamento } from "@/lib/backlog";
import { listaCabecalho, listaCelula, listaLinha, listaTituloGrupo } from "@/lib/kmm-lista";

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: C.muted }}>
        {itens.length} {itens.length === 1 ? "item" : "itens"} em Backlog, etapa Análise, com a tag &ldquo;Pronto para refinamento tech&rdquo;
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1100, display: "flex", flexDirection: "column", gap: 28 }}>
          {grupos.map((g) => {
            const aberto = !recolhidos[g.areaPath];
            return (
              <section key={g.areaPath}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0 10px" }}>
                  <button
                    type="button"
                    onClick={() => setRecolhidos((r) => ({ ...r, [g.areaPath]: aberto }))}
                    aria-expanded={aberto}
                    title={aberto ? "Comprimir" : "Expandir"}
                    style={{ background: "none", border: "none", cursor: "pointer", color: g.cor.bg, display: "flex", padding: 2 }}
                  >
                    <ChevronDown size={18} style={{ transform: aberto ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                  </button>
                  <span style={listaTituloGrupo(g.cor.bg)}>{g.squad}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{g.itens.length}</span>
                </div>

                {aberto && (
                  <>
                    <div style={{ ...listaLinha(COLUNAS), marginBottom: 6, paddingLeft: 6 }}>
                      {["ID", "Título", "Cliente", "PO", "Classificação", "Created Date", "Data Comitê", "Aging"].map((h, i) => (
                        <div key={h} style={{ ...listaCabecalho, textAlign: i < 2 ? "left" : "center" }}>
                          {h}
                        </div>
                      ))}
                    </div>
                    {g.itens.map((i) => {
                      const dias = i.dataComite ? Math.max(0, diasEntreChaves(chaveDia(i.dataComite), hojeChave)) : null;
                      const atrasado = dias != null && dias > DIAS_ALERTA_REFINAMENTO;
                      const c = (centro = true, primeira = false): React.CSSProperties => ({ ...listaCelula({ cor: g.cor.bg, primeira, centro }), color: C.text });
                      return (
                        <div key={i.id} style={listaLinha(COLUNAS)}>
                          <div style={{ ...c(false, true), fontVariantNumeric: "tabular-nums" }}>
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
                          <div style={{ ...c(false), fontWeight: 600 }} title={i.titulo}>
                            <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i.titulo}</span>
                          </div>
                          <div style={c()}>{i.cliente || "—"}</div>
                          <div style={{ ...c(), color: C.muted }}>{i.po || "—"}</div>
                          <div style={c()}>{i.classificacao || "—"}</div>
                          <div style={{ ...c(), fontVariantNumeric: "tabular-nums" }}>{i.createdDate ? formatarChaveDia(chaveDia(i.createdDate)) : "—"}</div>
                          <div style={{ ...c(), fontVariantNumeric: "tabular-nums" }}>{i.dataComite ? formatarChaveDia(chaveDia(i.dataComite)) : "—"}</div>
                          <div
                            style={{ ...c(), gap: 8, fontVariantNumeric: "tabular-nums", ...(atrasado ? { color: C.red, fontWeight: 700 } : {}) }}
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
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

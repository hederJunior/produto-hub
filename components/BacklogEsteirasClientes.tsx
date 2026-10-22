"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown } from "lucide-react";
import { C, corDeAreaTabela, infoPrioridade } from "@/lib/kmm-theme";
import { chaveDia, diasEntreChaves, formatarChaveDia } from "@/lib/datas";
import { DIAS_ALERTA_BACKLOG, ESTEIRAS_CLIENTES_SQUADS, nomeCurtoDaSquad, nomeDaSquad, type ItemBacklog } from "@/lib/backlog";

const ORG_DEVOPS = "kmmbynstech";

export type OrdemBacklog = "prioridade" | "data";

// id | Título | Cliente | PO | Created Date | Data Abertura Produto | Classificação | Feature | Priority | alerta
const COLUNAS = "64px minmax(240px, 2.4fr) minmax(110px, 1fr) minmax(110px, 1fr) 104px 124px minmax(110px, 1fr) minmax(120px, 1fr) 140px 28px";

/**
 * Ordenação aplicada a TODOS os agrupamentos (pedido por Heder em 2026-10-14), "em ordem
 * decrescente": prioridade = do mais prioritário (1 = Crítica) ao menos, sem prioridade por último;
 * data = Created Date do mais recente ao mais antigo. Sem ordem escolhida, segue o ID.
 */
function ordenar(itens: ItemBacklog[], ordem: OrdemBacklog | null): ItemBacklog[] {
  const copia = [...itens];
  if (ordem === "prioridade") {
    // Priority 0 (ou vazia) = não preenchida no Azure: vai sempre por último, nunca antes da 1.
    const peso = (p: number | null) => (p != null && p >= 1 ? p : 99);
    return copia.sort((a, b) => peso(a.prioridade) - peso(b.prioridade) || b.createdDate.localeCompare(a.createdDate));
  }
  if (ordem === "data") {
    return copia.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
  }
  return copia.sort((a, b) => a.id - b.id);
}

/**
 * Backlog > "Esteiras Clientes": gráfico de volume por squad + lista de PBIs agrupada por Area Path
 * (cor registrada da Área, a mesma das outras telas). Item aberto há mais de 30 dias (Created Date)
 * ganha um indicador vermelho no fim da linha.
 */
export default function BacklogEsteirasClientes({ itens, ordem, hoje }: { itens: ItemBacklog[]; ordem: OrdemBacklog | null; hoje: Date }) {
  const [recolhidos, setRecolhidos] = useState<Record<string, boolean>>({});
  const hojeChave = chaveDia(hoje);

  const grupos = useMemo(
    () =>
      ESTEIRAS_CLIENTES_SQUADS.map((squad) => {
        const doGrupo = itens.filter((i) => nomeDaSquad(i.areaPath) === squad);
        const areaPath = doGrupo[0]?.areaPath ?? squad;
        return { squad, areaPath, itens: ordenar(doGrupo, ordem), cor: corDeAreaTabela(areaPath) };
      }),
    [itens, ordem]
  );

  const dadosGrafico = grupos.map((g) => ({ nome: nomeCurtoDaSquad(g.squad), quantidade: g.itens.length, cor: g.cor.bg }));

  const celula: React.CSSProperties = { padding: "10px 10px", fontSize: 12.5, display: "flex", alignItems: "center", minWidth: 0, color: C.text };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="kmm-card" style={{ padding: "16px 18px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 16, color: C.text }}>Volume por squad</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {itens.length} {itens.length === 1 ? "item" : "itens"} em Backlog
          </div>
        </div>
        <div style={{ height: 200, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosGrafico} margin={{ top: 22, right: 12, left: 12, bottom: 0 }}>
              <XAxis dataKey="nome" tickLine={false} axisLine={{ stroke: C.border }} interval={0} tick={{ fontSize: 12, fill: C.muted, fontWeight: 600 }} />
              <YAxis hide domain={[0, "dataMax + 2"]} />
              <Tooltip cursor={{ fill: "transparent" }} formatter={(v: number) => [`${v} ${v === 1 ? "item" : "itens"}`, "Backlog"]} />
              <Bar dataKey="quantidade" radius={[10, 10, 10, 10]} maxBarSize={54} minPointSize={6} isAnimationActive={false}>
                {dadosGrafico.map((d) => (
                  <Cell key={d.nome} fill={d.cor} />
                ))}
                <LabelList dataKey="quantidade" position="top" style={{ fontSize: 13, fontWeight: 700, fill: C.text }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1180 }}>
          <div style={{ display: "grid", gridTemplateColumns: COLUNAS, padding: "10px 0", marginBottom: 6, fontSize: 11.5, fontWeight: 600, color: "#7A7680", background: "#F5F4F8", borderRadius: 10 }}>
            {["ID", "Título", "Cliente", "PO", "Created Date", "Abertura Produto", "Classificação", "Feature", "Priority", ""].map((h, i) => (
              <div key={`${h}-${i}`} style={{ padding: "0 10px" }}>
                {h}
              </div>
            ))}
          </div>

          {grupos.map((g) => {
            const aberto = !recolhidos[g.squad];
            return (
              <section key={g.squad} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0 8px", borderTop: `1px solid ${C.border}` }}>
                  <button
                    type="button"
                    onClick={() => setRecolhidos((r) => ({ ...r, [g.squad]: aberto }))}
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
                    {nomeCurtoDaSquad(g.squad)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{g.itens.length}</span>
                </div>

                {aberto && g.itens.length === 0 && <div style={{ padding: "4px 10px 10px 34px", fontSize: 12.5, color: C.muted }}>Nenhum item em Backlog.</div>}

                {aberto &&
                  g.itens.map((i) => {
                    const dias = i.createdDate ? Math.max(0, diasEntreChaves(chaveDia(i.createdDate), hojeChave)) : null;
                    const atrasado = dias != null && dias > DIAS_ALERTA_BACKLOG;
                    const prioridade = infoPrioridade(i.prioridade);
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
                        <div style={{ ...celula, fontVariantNumeric: "tabular-nums" }} title={dias != null ? `${dias} dias em aberto` : undefined}>
                          {i.createdDate ? formatarChaveDia(chaveDia(i.createdDate)) : "—"}
                        </div>
                        <div style={{ ...celula, fontVariantNumeric: "tabular-nums" }}>
                          {i.dataAberturaProduto ? formatarChaveDia(i.dataAberturaProduto.slice(0, 10)) : "—"}
                        </div>
                        <div style={celula}>{i.classificacao || "—"}</div>
                        <div style={celula}>{i.feature || "—"}</div>
                        <div style={celula}>
                          <span className="kmm-chip" style={{ background: prioridade.bg, color: prioridade.fg, borderColor: "transparent", fontSize: 11.5, whiteSpace: "nowrap" }}>
                            {prioridade.label}
                          </span>
                        </div>
                        <div style={{ ...celula, justifyContent: "center", padding: "10px 4px" }}>
                          {atrasado && (
                            <span
                              role="img"
                              aria-label={`Em aberto há ${dias} dias`}
                              title={`Em aberto há ${dias} dias (mais de ${DIAS_ALERTA_BACKLOG})`}
                              style={{ width: 12, height: 12, borderRadius: "50%", background: C.red, boxShadow: "0 0 0 3px #FBE7E4", display: "inline-block" }}
                            />
                          )}
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

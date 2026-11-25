"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { List, X } from "lucide-react";
import { BARRA_FORTE, BARRA_SUAVE, C } from "@/lib/kmm-theme";
import { chaveDia, formatarChaveDia } from "@/lib/datas";
import { agruparEstimativaPorMes, FATOR_ESTIMATIVA, rotuloCurtoDoMes, rotuloLongoDoMes, serieDoGrafico, type MesEstimativa } from "@/lib/estimativa-mensal";
import type { PbiGestaoCliente } from "@/lib/gestao-clientes";

const ORG_DEVOPS = "kmmbynstech";

const horas = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/**
 * Gestão de clientes > gráfico "Estimativa Total × 1,25" (pedido por Heder em 2026-11-24): barras horizontais, um mês de
 * Activated Date por barra, em um cartão quadrado abaixo de "Distribuição por status". Mostra os últimos 12 meses; o botão
 * abre o painel com as demandas de um mês e o esforço de cada uma. Esta visualização NÃO vai para o PDF da OPR (o aviso
 * pequeno no rodapé do cartão diz isso). Recebe os PBIs já filtrados (cliente/squad).
 */
export default function EstimativaMensal({ itens, carregando }: { itens: PbiGestaoCliente[]; carregando: boolean }) {
  const [painelAberto, setPainelAberto] = useState(false);
  const { meses, semDados } = useMemo(() => agruparEstimativaPorMes(itens), [itens]);
  const serie = useMemo(() => serieDoGrafico(meses), [meses]);
  const dados = serie.map((m) => ({ mes: m.mes, rotulo: rotuloCurtoDoMes(m.mes), horas: Math.round(m.horas * 10) / 10, demandas: m.itens.length }));
  const ultimo = dados.length - 1;

  return (
    <>
      <div className="kmm-card" style={{ aspectRatio: "1 / 1", display: "flex", flexDirection: "column", padding: "16px 16px 10px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 14, color: C.text }}>Estimativa Total × 1,25</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Horas por mês de ativação (Activated Date).</div>
          </div>
          <button
            type="button"
            onClick={() => setPainelAberto(true)}
            disabled={carregando || meses.length === 0}
            title="Ver as demandas que compõem cada mês e o esforço de cada uma"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, padding: "5px 9px", fontSize: 12, fontWeight: 500, color: C.text, cursor: carregando || meses.length === 0 ? "not-allowed" : "pointer", opacity: carregando || meses.length === 0 ? 0.5 : 1 }}
          >
            <List size={13} /> Demandas
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, marginTop: 6 }}>
          {carregando ? (
            <div style={{ padding: "24px 4px", fontSize: 13, color: C.muted }}>Carregando…</div>
          ) : dados.length === 0 ? (
            <div style={{ padding: "24px 4px", fontSize: 13, color: C.muted }}>
              {meses.length ? "Nenhuma demanda ativada nos últimos 12 meses." : "Nenhuma demanda com Activated Date e Estimativa Total para os filtros atuais."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados} layout="vertical" margin={{ top: 2, right: 46, left: 0, bottom: 2 }}>
                <XAxis type="number" hide domain={[0, "dataMax"]} />
                <YAxis type="category" dataKey="rotulo" width={44} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 10.5, fill: "#7A7680" }} />
                <Tooltip cursor={{ fill: "transparent" }} formatter={(v: number, _n, p) => [`${horas(v)} h · ${p.payload.demandas} ${p.payload.demandas === 1 ? "demanda" : "demandas"}`, rotuloLongoDoMes(p.payload.mes)]} labelFormatter={() => ""} />
                <Bar dataKey="horas" radius={[0, 6, 6, 0]} barSize={11} minPointSize={2} isAnimationActive={false}>
                  {dados.map((d, i) => (
                    <Cell key={d.mes} fill={i === ultimo ? BARRA_FORTE : BARRA_SUAVE} />
                  ))}
                  <LabelList dataKey="horas" position="right" formatter={(v: number) => `${horas(v)} h`} style={{ fontSize: 10.5, fontWeight: 600, fill: C.text }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.35, marginTop: 4 }}>
          {!carregando && semDados > 0 ? `${semDados} ${semDados === 1 ? "demanda sem" : "demandas sem"} Estimativa Total ou Activated Date ficou de fora. ` : ""}
          Esta visualização não é gerada no PDF da OPR.
        </div>
      </div>

      {painelAberto && <PainelEstimativaMensal meses={meses} onFechar={() => setPainelAberto(false)} />}
    </>
  );
}

/** Painel (modal): escolhe um mês e lista as demandas consideradas naquele mês, com o esforço (Estimativa Total e × 1,25). */
function PainelEstimativaMensal({ meses, onFechar }: { meses: MesEstimativa[]; onFechar: () => void }) {
  const decrescentes = useMemo(() => [...meses].sort((a, b) => b.mes.localeCompare(a.mes)), [meses]);
  const [mesSel, setMesSel] = useState(decrescentes[0]?.mes ?? "");
  const mes = decrescentes.find((m) => m.mes === mesSel) ?? decrescentes[0];
  const itens = useMemo(() => [...(mes?.itens ?? [])].sort((a, b) => (b.estimativaTotal ?? 0) - (a.estimativaTotal ?? 0) || a.id - b.id), [mes]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(30,27,24,.38)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Demandas do mês" className="kmm-card" style={{ width: "100%", maxWidth: 940, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px 12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 16, color: C.text }}>Demandas consideradas no mês</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Mês do Activated Date. Esforço = Estimativa Total × {String(FATOR_ESTIMATIVA).replace(".", ",")}.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: C.muted }}>
              Mês
              <select value={mes?.mes ?? ""} onChange={(e) => setMesSel(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 10px", fontSize: 13, color: C.text, background: "#fff", fontFamily: "inherit" }}>
                {decrescentes.map((m) => (
                  <option key={m.mes} value={m.mes}>
                    {rotuloLongoDoMes(m.mes)} · {horas(m.horas)} h
                  </option>
                ))}
              </select>
            </label>
            <button onClick={onFechar} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="kmm-rolagem" style={{ overflow: "auto", maxHeight: "min(420px, calc(100vh - 320px))", borderTop: `1px solid ${C.border}` }}>
          <table className="kmm-tab" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                {["Chamado", "Tarefa", "PBI", "Status", "Ativada em", "Estimativa Total", `Esforço × ${String(FATOR_ESTIMATIVA).replace(".", ",")}`].map((h, i) => (
                  <th key={h} style={{ textAlign: i >= 5 ? "right" : "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((p) => (
                <tr key={p.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{p.idExterno || "—"}</td>
                  <td style={{ minWidth: 240 }} title={p.titulo}>
                    <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.titulo}</span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <a href={`https://dev.azure.com/${ORG_DEVOPS}/${encodeURIComponent(p.projeto)}/_workitems/edit/${p.id}`} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none", fontWeight: 500 }}>
                      {p.id}
                    </a>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{p.state}</td>
                  <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{p.dataAtivacao ? formatarChaveDia(chaveDia(p.dataAtivacao)) : "—"}</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{horas(p.estimativaTotal ?? 0)} h</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{horas((p.estimativaTotal ?? 0) * FATOR_ESTIMATIVA)} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "11px 18px", borderTop: `1px solid ${C.border}`, background: C.soft, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>
            {itens.length} {itens.length === 1 ? "demanda" : "demandas"} · Estimativa Total {horas(mes?.bruto ?? 0)} h
          </span>
          <span style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{horas(mes?.horas ?? 0)} h no mês</span>
        </div>
      </div>
    </div>
  );
}

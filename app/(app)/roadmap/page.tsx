"use client";

import { useEffect, useMemo, useState } from "react";
import { useProduto, type ProdutoSelecionado } from "@/components/ProdutoContext";
import { C } from "@/lib/kmm-theme";

type FeatureRoadmap = {
  id: number;
  titulo: string;
  state: string;
  startDate: string | null;
  targetDate: string | null;
};

type EpicRoadmap = {
  id: number;
  titulo: string;
  areaPath: string;
  descricao: string;
  produto: string;
  state: string;
  startDate: string | null;
  targetDate: string | null;
  features: FeatureRoadmap[];
};

const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function inicioDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function fimDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMeses(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Lista o primeiro dia de cada mês entre `inicio` e `fim` (ambos inclusos), pro cabeçalho do Gantt. */
function listarMeses(inicio: Date, fim: Date): Date[] {
  const meses: Date[] = [];
  let cursor = inicioDoMes(inicio);
  const limite = inicioDoMes(fim);
  let guarda = 0;
  while (cursor.getTime() <= limite.getTime() && guarda < 60) {
    meses.push(cursor);
    cursor = addMeses(cursor, 1);
    guarda += 1;
  }
  return meses;
}

/** Posição (0–100%) de uma data dentro do intervalo [inicio, fim] do Gantt, por dia corrido. */
function posicaoPercentual(dataISO: string | null, inicioMs: number, fimMs: number): number {
  if (!dataISO) return 0;
  const d = new Date(dataISO).getTime();
  if (Number.isNaN(d) || fimMs === inicioMs) return 0;
  return Math.min(100, Math.max(0, ((d - inicioMs) / (fimMs - inicioMs)) * 100));
}

function formatarData(dataISO: string | null): string {
  if (!dataISO) return "sem data";
  const d = new Date(dataISO);
  if (Number.isNaN(d.getTime())) return "sem data";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const LARGURA_COLUNA_LABEL = 280;

export default function RoadmapPage() {
  const { produto } = useProduto();
  const [epicos, setEpicos] = useState<EpicRoadmap[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    fetch(`/api/roadmap/epicos?produto=${produto}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (j.erro) setErro(j.erro);
        setEpicos(j.epicos ?? []);
      })
      .catch(() => setErro("Não foi possível carregar o roadmap do Azure DevOps."))
      .finally(() => setCarregando(false));
  }, [produto]);

  const { meses, inicioMs, fimMs } = useMemo(() => {
    const datas: Date[] = [];
    for (const epic of epicos) {
      if (epic.startDate) datas.push(new Date(epic.startDate));
      if (epic.targetDate) datas.push(new Date(epic.targetDate));
      for (const f of epic.features) {
        if (f.startDate) datas.push(new Date(f.startDate));
        if (f.targetDate) datas.push(new Date(f.targetDate));
      }
    }
    datas.sort((a, b) => a.getTime() - b.getTime());

    const hoje = new Date();
    const minData = datas.length ? datas[0] : hoje;
    const maxData = datas.length ? datas[datas.length - 1] : addMeses(hoje, 5);

    const inicioCalc = inicioDoMes(minData);
    const fimCalc = fimDoMes(maxData.getTime() < inicioCalc.getTime() ? inicioCalc : maxData);

    return {
      meses: listarMeses(inicioCalc, fimCalc),
      inicioMs: inicioCalc.getTime(),
      fimMs: fimCalc.getTime(),
    };
  }, [epicos]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>Roadmap e entregas</h1>
          <p style={{ color: C.muted, marginTop: 4, marginBottom: 0 }}>
            Epics e Features do Azure DevOps, por área e período — versão inicial em validação (Epic #15057).
          </p>
        </div>
        <ProdutoFiltro />
      </div>

      <div style={{ marginTop: 24 }}>
        {carregando && <p style={{ color: C.muted }}>Carregando roadmap do Azure DevOps…</p>}

        {erro && (
          <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>
            {erro}
          </div>
        )}

        {!carregando && !erro && epicos.length === 0 && (
          <p style={{ color: C.muted }}>Nenhum Epic encontrado para o produto selecionado.</p>
        )}

        {!carregando && !erro && epicos.length > 0 && (
          <GanttRoadmap epicos={epicos} meses={meses} inicioMs={inicioMs} fimMs={fimMs} />
        )}
      </div>
    </div>
  );
}

/** Filtro de produto no início da página, no mesmo padrão visual do seletor do header (kmm-seg). */
function ProdutoFiltro() {
  const { produto, setProduto } = useProduto();
  const opcoes: { valor: ProdutoSelecionado; label: string }[] = [
    { valor: "KMM4", label: "KMM4" },
    { valor: "KMM5", label: "KMM5" },
    { valor: "AMBOS", label: "Ambos" },
  ];
  return (
    <div className="kmm-seg">
      {opcoes.map((o) => (
        <div
          key={o.valor}
          className={`kmm-seg-item${produto === o.valor ? " active" : ""}`}
          onClick={() => setProduto(o.valor)}
        >
          {o.label}
        </div>
      ))}
    </div>
  );
}

function GanttRoadmap({
  epicos,
  meses,
  inicioMs,
  fimMs,
}: {
  epicos: EpicRoadmap[];
  meses: Date[];
  inicioMs: number;
  fimMs: number;
}) {
  return (
    <div className="kmm-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex" }}>
        <div style={{ width: LARGURA_COLUNA_LABEL, flexShrink: 0, borderRight: `1px solid ${C.border}` }} />
        <div style={{ flex: 1, display: "flex" }}>
          {meses.map((m, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 12,
                fontWeight: 700,
                color: C.muted,
                padding: "10px 4px",
                borderLeft: i === 0 ? "none" : `1px solid ${C.grid}`,
                textTransform: "uppercase",
                letterSpacing: ".03em",
              }}
            >
              {MESES_PT[m.getMonth()]}/{String(m.getFullYear()).slice(2)}
            </div>
          ))}
        </div>
      </div>

      {epicos.map((epic) => (
        <div key={epic.id} style={{ borderTop: `1px solid ${C.border}` }}>
          {/* Swimlane do Epic: rótulo = Area Path (regra "SALES = AREA PATH") */}
          <div style={{ display: "flex", background: C.soft }}>
            <div
              style={{
                width: LARGURA_COLUNA_LABEL,
                flexShrink: 0,
                padding: "10px 14px",
                fontWeight: 800,
                fontSize: 13,
                color: C.text,
                borderRight: `1px solid ${C.border}`,
                textTransform: "uppercase",
                letterSpacing: ".03em",
              }}
            >
              {epic.areaPath.split("\\").pop() || epic.areaPath || "Sem Area Path"}
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <GradeMeses totalMeses={meses.length} />
            </div>
          </div>

          {/* Sub-linha do Epic: título + descrição (regra "STRATEGY e RESEARCH = descrição do EPIC") */}
          <div style={{ display: "flex" }}>
            <div style={{ width: LARGURA_COLUNA_LABEL, flexShrink: 0, padding: "10px 14px", borderRight: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{epic.titulo}</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, whiteSpace: "pre-line" }}>
                {epic.descricao || "Sem descrição cadastrada no Azure DevOps."}
              </div>
            </div>
            <div style={{ flex: 1, position: "relative", minHeight: 56 }}>
              <GradeMeses totalMeses={meses.length} />
              {epic.startDate && epic.targetDate && (
                <BarraGantt
                  inicioPct={posicaoPercentual(epic.startDate, inicioMs, fimMs)}
                  fimPct={posicaoPercentual(epic.targetDate, inicioMs, fimMs)}
                  cor={C.dark}
                  label={`Epic #${epic.id}: ${formatarData(epic.startDate)} – ${formatarData(epic.targetDate)}`}
                />
              )}
            </div>
          </div>

          {/* Features filhas do Epic (Work Item = Feature) */}
          {epic.features.length === 0 && (
            <div style={{ display: "flex", borderTop: `1px solid ${C.grid}` }}>
              <div style={{ width: LARGURA_COLUNA_LABEL, flexShrink: 0, padding: "8px 14px 8px 28px", borderRight: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
                Nenhuma Feature filha encontrada.
              </div>
              <div style={{ flex: 1, position: "relative", minHeight: 36 }}>
                <GradeMeses totalMeses={meses.length} />
              </div>
            </div>
          )}
          {epic.features.map((f) => (
            <div key={f.id} style={{ display: "flex", borderTop: `1px solid ${C.grid}` }}>
              <div
                style={{
                  width: LARGURA_COLUNA_LABEL,
                  flexShrink: 0,
                  padding: "8px 14px 8px 28px",
                  borderRight: `1px solid ${C.border}`,
                  fontSize: 12.5,
                  color: C.text,
                }}
              >
                {f.titulo}
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.state}</div>
              </div>
              <div style={{ flex: 1, position: "relative", minHeight: 44 }}>
                <GradeMeses totalMeses={meses.length} />
                {f.startDate && f.targetDate ? (
                  <BarraGantt
                    inicioPct={posicaoPercentual(f.startDate, inicioMs, fimMs)}
                    fimPct={posicaoPercentual(f.targetDate, inicioMs, fimMs)}
                    cor={C.orange}
                    label={`${formatarData(f.startDate)} – ${formatarData(f.targetDate)}`}
                  />
                ) : (
                  <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.faint }}>
                    Sem Start/Target Date cadastrada
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Linhas verticais de fundo marcando a divisa entre meses, atrás das barras do Gantt. */
function GradeMeses({ totalMeses }: { totalMeses: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", pointerEvents: "none" }}>
      {Array.from({ length: totalMeses }).map((_, i) => (
        <div key={i} style={{ flex: 1, borderLeft: i === 0 ? "none" : `1px solid ${C.grid}` }} />
      ))}
    </div>
  );
}

function BarraGantt({ inicioPct, fimPct, cor, label }: { inicioPct: number; fimPct: number; cor: string; label: string }) {
  const largura = Math.max(fimPct - inicioPct, 1.5);
  return (
    <div
      title={label}
      style={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        left: `${inicioPct}%`,
        width: `${largura}%`,
        height: 20,
        borderRadius: 6,
        background: cor,
        boxShadow: "0 1px 2px rgba(20,16,12,.15)",
      }}
    />
  );
}

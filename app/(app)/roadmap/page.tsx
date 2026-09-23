"use client";

import { useEffect, useMemo, useState } from "react";
import { useProduto, type ProdutoSelecionado } from "@/components/ProdutoContext";
import { C, corDeEstadoDevOps } from "@/lib/kmm-theme";

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

type TaskAlocada = {
  id: number;
  titulo: string;
  produto: string;
  state: string;
  prioridade: number | null;
  spEstimados: number | null;
  spReal: number | null;
  sprint: string;
  responsavel: { nome: string; avatarUrl: string | null } | null;
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

/**
 * Prioridade do Azure DevOps vem como número (1–4). Convenção padrão adotada (não confirmada
 * campo a campo com o Heder, só a leitura usual do Priority no processo do Azure DevOps):
 * 1 = Crítica, 2 = Alta, 3 = Média, 4 = Baixa.
 */
function infoPrioridade(p: number | null): { label: string; bg: string; fg: string } {
  switch (p) {
    case 1:
      return { label: "Crítica", bg: "#FBE7E4", fg: C.red };
    case 2:
      return { label: "Alta", bg: "#FFF1EA", fg: C.orange };
    case 3:
      return { label: "Média", bg: "#FCEFD8", fg: C.amber };
    case 4:
      return { label: "Baixa", bg: "#E7F5EC", fg: C.green };
    default:
      return { label: "Sem prioridade", bg: C.soft, fg: C.muted };
  }
}

const LARGURA_COLUNA_LABEL = 280;

type Visao = "roadmap" | "sprints";

export default function RoadmapPage() {
  const { produto } = useProduto();
  const [visao, setVisao] = useState<Visao>("roadmap");

  const [epicos, setEpicos] = useState<EpicRoadmap[]>([]);
  const [carregandoRoadmap, setCarregandoRoadmap] = useState(true);
  const [erroRoadmap, setErroRoadmap] = useState<string | null>(null);

  const [tarefas, setTarefas] = useState<TaskAlocada[]>([]);
  const [carregandoSprints, setCarregandoSprints] = useState(true);
  const [erroSprints, setErroSprints] = useState<string | null>(null);

  useEffect(() => {
    setCarregandoRoadmap(true);
    setErroRoadmap(null);
    fetch(`/api/roadmap/epicos?produto=${produto}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (j.erro) setErroRoadmap(j.erro);
        setEpicos(j.epicos ?? []);
      })
      .catch(() => setErroRoadmap("Não foi possível carregar o roadmap do Azure DevOps."))
      .finally(() => setCarregandoRoadmap(false));
  }, [produto]);

  useEffect(() => {
    setCarregandoSprints(true);
    setErroSprints(null);
    fetch(`/api/roadmap/tarefas?produto=${produto}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (j.erro) setErroSprints(j.erro);
        setTarefas(j.tarefas ?? []);
      })
      .catch(() => setErroSprints("Não foi possível carregar as sprints do Azure DevOps."))
      .finally(() => setCarregandoSprints(false));
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
            {visao === "roadmap"
              ? "Epics e Features do Azure DevOps, por área e período — versão inicial em validação (Epic #15057)."
              : "Tasks alocadas por sprint — versão inicial em validação (Task #31537)."}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <VisaoFiltro visao={visao} setVisao={setVisao} />
          <ProdutoFiltro />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {visao === "roadmap" ? (
          <>
            {carregandoRoadmap && <p style={{ color: C.muted }}>Carregando roadmap do Azure DevOps…</p>}
            {erroRoadmap && (
              <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>
                {erroRoadmap}
              </div>
            )}
            {!carregandoRoadmap && !erroRoadmap && epicos.length === 0 && (
              <p style={{ color: C.muted }}>Nenhum Epic encontrado para o produto selecionado.</p>
            )}
            {!carregandoRoadmap && !erroRoadmap && epicos.length > 0 && (
              <GanttRoadmap epicos={epicos} meses={meses} inicioMs={inicioMs} fimMs={fimMs} />
            )}
          </>
        ) : (
          <>
            {carregandoSprints && <p style={{ color: C.muted }}>Carregando sprints do Azure DevOps…</p>}
            {erroSprints && (
              <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>
                {erroSprints}
              </div>
            )}
            {!carregandoSprints && !erroSprints && tarefas.length === 0 && (
              <p style={{ color: C.muted }}>Nenhuma Task encontrada para o produto selecionado.</p>
            )}
            {!carregandoSprints && !erroSprints && tarefas.length > 0 && <SprintsAlocadas tarefas={tarefas} />}
          </>
        )}
      </div>
    </div>
  );
}

/** Alterna entre a visão de Road Map (Gantt por Epic) e a de Sprints alocadas (Tasks por sprint). */
function VisaoFiltro({ visao, setVisao }: { visao: Visao; setVisao: (v: Visao) => void }) {
  const opcoes: { valor: Visao; label: string }[] = [
    { valor: "roadmap", label: "Road Map" },
    { valor: "sprints", label: "Sprints" },
  ];
  return (
    <div className="kmm-seg">
      {opcoes.map((o) => (
        <div key={o.valor} className={`kmm-seg-item${visao === o.valor ? " active" : ""}`} onClick={() => setVisao(o.valor)}>
          {o.label}
        </div>
      ))}
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

const COLUNAS_SPRINT = "1fr 190px 150px 110px 110px 110px";

/**
 * Seção "Sprints alocadas": Tasks agrupadas por Sprint (System.IterationLevel3), no estilo do
 * protótipo enviado pelo Heder — sem a coluna "Tipo" (não existe campo equivalente numa Task
 * desse projeto) e usando Effort/Completed Work como SP Estimados/SP Real (decisões tomadas com
 * o Heder em 2026-09-23, ver lib/devops-client.ts).
 */
function SprintsAlocadas({ tarefas }: { tarefas: TaskAlocada[] }) {
  const porSprint = useMemo(() => {
    const grupos: Record<string, TaskAlocada[]> = {};
    for (const t of tarefas) {
      grupos[t.sprint] ??= [];
      grupos[t.sprint].push(t);
    }
    return grupos;
  }, [tarefas]);

  const nomesSprints = Object.keys(porSprint).sort();

  return (
    <div>
      {nomesSprints.map((sprint) => {
        const itens = porSprint[sprint];
        const somaEstimados = itens.reduce((acc, t) => acc + (t.spEstimados ?? 0), 0);
        const somaReal = itens.reduce((acc, t) => acc + (t.spReal ?? 0), 0);

        return (
          <div key={sprint} className="kmm-card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "14px 18px 8px" }}>
              <span style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 16, color: C.orange }}>{sprint}</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: COLUNAS_SPRINT,
                padding: "0 18px 8px",
                fontSize: 11,
                fontWeight: 700,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: ".03em",
              }}
            >
              <div>&nbsp;</div>
              <div>Resp.</div>
              <div>Status</div>
              <div>Prioridade</div>
              <div style={{ textAlign: "right" }}>SP Estimados</div>
              <div style={{ textAlign: "right" }}>SP Real</div>
            </div>

            {itens.map((t) => {
              const prio = infoPrioridade(t.prioridade);
              const status = corDeEstadoDevOps(t.state);
              return (
                <div
                  key={t.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: COLUNAS_SPRINT,
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 18px",
                    borderTop: `1px solid ${C.grid}`,
                    borderLeft: `4px solid ${prio.fg}`,
                  }}
                >
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{t.titulo}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    {t.responsavel?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- avatar vem direto da API do Azure DevOps
                      <img
                        src={t.responsavel.avatarUrl}
                        alt={t.responsavel.nome}
                        width={22}
                        height={22}
                        style={{ borderRadius: "50%", flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.soft, flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.responsavel?.nome ?? "Sem responsável"}
                    </span>
                  </div>
                  <span className="kmm-chip" style={{ background: status.bg, color: status.fg, borderColor: "transparent" }}>
                    {t.state}
                  </span>
                  <span className="kmm-chip" style={{ background: prio.bg, color: prio.fg, borderColor: "transparent" }}>
                    {prio.label}
                  </span>
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: C.text }}>{t.spEstimados ?? "—"}</div>
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: C.text }}>{t.spReal ?? "—"}</div>
                </div>
              );
            })}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: COLUNAS_SPRINT,
                padding: "10px 18px",
                borderTop: `1px solid ${C.border}`,
                background: C.soft,
              }}
            >
              <div />
              <div />
              <div />
              <div style={{ fontSize: 11, color: C.muted, textAlign: "right", fontWeight: 700, alignSelf: "center" }}>Soma</div>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: C.text }}>{somaEstimados}</div>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: C.text }}>{somaReal}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

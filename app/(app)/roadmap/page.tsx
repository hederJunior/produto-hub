"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown, ChevronUp, Clock, Flag, Gauge, Maximize2, X } from "lucide-react";
import { useProduto } from "@/components/ProdutoContext";
import { C, corDaArea, corDeEstadoDevOps, corDeStatus, estadoIndicaConcluido } from "@/lib/kmm-theme";

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
  responsavel: { nome: string; avatarUrl: string | null } | null;
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
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

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

/** Agrupa uma lista de meses consecutivos em blocos de trimestre, pro cabeçalho de 2 níveis. */
function agruparPorTrimestre(meses: Date[]): { label: string; span: number }[] {
  const grupos: { label: string; span: number }[] = [];
  for (const m of meses) {
    const trimestre = Math.floor(m.getMonth() / 3) + 1;
    const label = `Q${trimestre} ${m.getFullYear()}`;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.label === label) ultimo.span += 1;
    else grupos.push({ label, span: 1 });
  }
  return grupos;
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
 * Progresso (0–100) do Epic, estimado pela proporção de Features filhas com State "concluído"
 * (ver estadoIndicaConcluido em lib/kmm-theme.ts). Sem Features, usa o próprio State do Epic.
 */
function progressoDoEpic(epic: EpicRoadmap): number {
  if (!epic.features.length) return estadoIndicaConcluido(epic.state) ? 100 : 0;
  const concluidas = epic.features.filter((f) => estadoIndicaConcluido(f.state)).length;
  return Math.round((concluidas / epic.features.length) * 100);
}

/**
 * Status de prazo do Epic (No prazo / Atenção / Atrasado), mesma fórmula usada em
 * getRoadmapItems() (lib/devops-client.ts) pro roadmap antigo por trimestre — reaproveitada aqui
 * pra manter os dois painéis consistentes.
 */
function statusPrazoDoEpic(epic: EpicRoadmap, progresso: number): "No prazo" | "Atenção" | "Atrasado" {
  if (!epic.targetDate) return "No prazo";
  const diasRestantes = (new Date(epic.targetDate).getTime() - Date.now()) / 86_400_000;
  if (diasRestantes < 0 && progresso < 100) return "Atrasado";
  if (diasRestantes < 15 && progresso < 80) return "Atenção";
  return "No prazo";
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

const LARGURA_COLUNA_LABEL = 300;

type Visao = "roadmap" | "sprints";

export default function RoadmapPage() {
  const { produto } = useProduto();
  const [visao, setVisao] = useState<Visao>("roadmap");

  const [epicos, setEpicos] = useState<EpicRoadmap[]>([]);
  const [carregandoRoadmap, setCarregandoRoadmap] = useState(true);
  const [erroRoadmap, setErroRoadmap] = useState<string | null>(null);
  const [areaSelecionada, setAreaSelecionada] = useState("todas");
  const [epicDescricaoAberta, setEpicDescricaoAberta] = useState<number | null>(null);
  const [featuresAbertas, setFeaturesAbertas] = useState<Record<number, boolean>>({});

  const [tarefas, setTarefas] = useState<TaskAlocada[]>([]);
  const [carregandoSprints, setCarregandoSprints] = useState(true);
  const [erroSprints, setErroSprints] = useState<string | null>(null);

  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => setAgora(new Date()), []);

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

  const areasDisponiveis = useMemo(() => Array.from(new Set(epicos.map((e) => e.areaPath))).sort(), [epicos]);

  const epicosExibidos = useMemo(
    () => (areaSelecionada === "todas" ? epicos : epicos.filter((e) => e.areaPath === areaSelecionada)),
    [epicos, areaSelecionada]
  );

  const { meses, inicioMs, fimMs } = useMemo(() => {
    const datas: Date[] = [];
    for (const epic of epicosExibidos) {
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
  }, [epicosExibidos]);

  const progressos = epicosExibidos.map((e) => progressoDoEpic(e));
  const entregasNaVisao = epicosExibidos.length;
  const emAndamento = progressos.filter((p) => p > 0 && p < 100).length;
  const progressoMedio = progressos.length ? Math.round(progressos.reduce((a, b) => a + b, 0) / progressos.length) : 0;
  const gruposTrimestre = agruparPorTrimestre(meses);
  const horizonte = !gruposTrimestre.length
    ? "—"
    : gruposTrimestre.length === 1
    ? gruposTrimestre[0].label.split(" ")[0]
    : `${gruposTrimestre[0].label.split(" ")[0]} — ${gruposTrimestre[gruposTrimestre.length - 1].label.split(" ")[0]}`;

  const subtituloPeriodo = !meses.length
    ? "sem período definido"
    : meses.length === 1
    ? `${MESES_PT[meses[0].getMonth()].toLowerCase()} de ${meses[0].getFullYear()}`
    : `${MESES_PT[meses[0].getMonth()].toLowerCase()} a ${MESES_PT[meses[meses.length - 1].getMonth()].toLowerCase()} de ${meses[
        meses.length - 1
      ].getFullYear()}`;

  const produtoLabelFooter = produto === "AMBOS" ? "KMM4 e KMM5" : produto;
  const epicDescricao = epicos.find((e) => e.id === epicDescricaoAberta) ?? null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>Roadmap e entregas</h1>
          <p style={{ color: C.muted, marginTop: 4, marginBottom: 0 }}>
            {visao === "roadmap"
              ? "Cronograma estratégico de desenvolvimento, marcos e entregas do time de Produto."
              : "Tasks alocadas por sprint — versão inicial em validação (Task #31537)."}
          </p>
        </div>
        <VisaoFiltro visao={visao} setVisao={setVisao} />
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
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
                  <StatTile icon={<Flag size={18} color={C.orange} />} bg="#FDEDE7" label="Entregas na visão" valor={String(entregasNaVisao)} />
                  <StatTile icon={<Clock size={18} color={C.blue} />} bg="#E9F1FB" label="Em andamento" valor={String(emAndamento)} />
                  <StatTile icon={<Gauge size={18} color="#8B5CF6" />} bg="#F1ECFB" label="Progresso médio" valor={`${progressoMedio}%`} />
                  <StatTile icon={<Calendar size={18} color={C.orangeDark} />} bg="#FDEDE0" label="Horizonte" valor={horizonte} />
                </div>

                <div className="kmm-card" style={{ padding: "18px 18px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 16, color: C.text }}>Plano de entregas</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Visão mensal · {subtituloPeriodo}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                      <LegendaStatus />
                      <select
                        className="kmm-input"
                        style={{ width: "auto" }}
                        value={areaSelecionada}
                        onChange={(e) => setAreaSelecionada(e.target.value)}
                      >
                        <option value="todas">Todas as áreas</option>
                        {areasDisponiveis.map((a) => (
                          <option key={a} value={a}>
                            {a.split("\\").pop() || a}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: LARGURA_COLUNA_LABEL + meses.length * 90 }}>
                      <CabecalhoMeses meses={meses} gruposTrimestre={gruposTrimestre} />
                      {epicosExibidos.map((epic) => (
                        <EpicRow
                          key={epic.id}
                          epic={epic}
                          meses={meses}
                          inicioMs={inicioMs}
                          fimMs={fimMs}
                          aberto={featuresAbertas[epic.id] ?? true}
                          onToggle={() => setFeaturesAbertas((f) => ({ ...f, [epic.id]: !(f[epic.id] ?? true) }))}
                          onExpandirDescricao={() => setEpicDescricaoAberta(epic.id)}
                        />
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, paddingTop: 12 }}>
                    <span>Planejamento consolidado de {produtoLabelFooter}</span>
                    <span>{agora ? `Atualizado em ${agora.getDate()} ${MESES_ABREV[agora.getMonth()]} ${agora.getFullYear()}` : ""}</span>
                  </div>
                </div>
              </>
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

      {epicDescricao && <ModalDescricaoEpic epic={epicDescricao} onFechar={() => setEpicDescricaoAberta(null)} />}
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

function StatTile({ icon, bg, label, valor }: { icon: React.ReactNode; bg: string; label: string; valor: string }) {
  return (
    <div className="kmm-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: C.text, fontFamily: "Sora,sans-serif" }}>{valor}</div>
      </div>
    </div>
  );
}

function LegendaStatus() {
  const itens: { label: string; cor: string }[] = [
    { label: "No prazo", cor: C.green },
    { label: "Atenção", cor: C.amber },
    { label: "Atrasado", cor: C.red },
  ];
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: C.muted }}>
      {itens.map((i) => (
        <span key={i.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: i.cor, display: "inline-block" }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function CabecalhoMeses({ meses, gruposTrimestre }: { meses: Date[]; gruposTrimestre: { label: string; span: number }[] }) {
  return (
    <div>
      <div style={{ display: "flex" }}>
        <div style={{ width: LARGURA_COLUNA_LABEL, flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex" }}>
          {gruposTrimestre.map((g, i) => (
            <div
              key={i}
              style={{
                flex: g.span,
                textAlign: "center",
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                padding: "4px 4px",
                borderLeft: i === 0 ? "none" : `1px solid ${C.grid}`,
                textTransform: "uppercase",
                letterSpacing: ".04em",
              }}
            >
              {g.label}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
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
                padding: "8px 4px",
                borderLeft: i === 0 ? "none" : `1px solid ${C.grid}`,
              }}
            >
              {MESES_PT[m.getMonth()]}/{String(m.getFullYear()).slice(2)}
            </div>
          ))}
        </div>
      </div>
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

function EpicRow({
  epic,
  meses,
  inicioMs,
  fimMs,
  aberto,
  onToggle,
  onExpandirDescricao,
}: {
  epic: EpicRoadmap;
  meses: Date[];
  inicioMs: number;
  fimMs: number;
  aberto: boolean;
  onToggle: () => void;
  onExpandirDescricao: () => void;
}) {
  const cor = corDaArea(epic.areaPath);
  const progresso = progressoDoEpic(epic);
  const statusPrazo = statusPrazoDoEpic(epic, progresso);
  const corStatus = corDeStatus(statusPrazo);

  return (
    <div style={{ position: "relative", borderTop: `1px solid ${C.border}`, borderLeft: `5px solid ${cor}` }}>
      <button
        onClick={onExpandirDescricao}
        title="Ver descrição do Epic"
        style={{
          position: "absolute",
          top: -11,
          right: 14,
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          fontWeight: 700,
          color: C.muted,
          background: "#fff",
          border: `1px solid ${C.border}`,
          borderRadius: 999,
          padding: "3px 10px",
          cursor: "pointer",
        }}
      >
        <Maximize2 size={11} /> Expandir
      </button>

      <div style={{ display: "flex" }}>
        <div style={{ width: LARGURA_COLUNA_LABEL, flexShrink: 0, padding: "14px 14px 12px", borderRight: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>{epic.titulo}</span>
            <span className="kmm-chip" style={{ background: corStatus.bg, color: corStatus.fg, borderColor: "transparent", fontSize: 11 }}>
              {statusPrazo}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
            {epic.produto || epic.areaPath.split("\\")[0]} · {epic.responsavel?.nome ?? "Sem responsável"}
          </div>
          {epic.features.length > 0 && (
            <button
              onClick={onToggle}
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11.5,
                color: C.muted,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {aberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {aberto ? "Ocultar" : "Mostrar"} {epic.features.length} feature{epic.features.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
        <div style={{ flex: 1, position: "relative", minHeight: 64 }}>
          <GradeMeses totalMeses={meses.length} />
          {epic.startDate && epic.targetDate && (
            <BarraComProgresso
              inicioPct={posicaoPercentual(epic.startDate, inicioMs, fimMs)}
              fimPct={posicaoPercentual(epic.targetDate, inicioMs, fimMs)}
              cor={C.orangeDark}
              progresso={progresso}
              label={`Epic #${epic.id}: ${formatarData(epic.startDate)} – ${formatarData(epic.targetDate)}`}
            />
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateRows: aberto ? "1fr" : "0fr", transition: "grid-template-rows 220ms ease" }}>
        <div style={{ overflow: "hidden" }}>
          {epic.features.map((f) => (
            <div key={f.id} style={{ display: "flex", borderTop: `1px solid ${C.grid}` }}>
              <div
                style={{
                  width: LARGURA_COLUNA_LABEL,
                  flexShrink: 0,
                  padding: "8px 14px 8px 24px",
                  borderRight: `1px solid ${C.border}`,
                  borderLeft: `4px solid ${cor}`,
                  fontSize: 12.5,
                  color: C.text,
                }}
              >
                {f.titulo}
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.state}</div>
              </div>
              <div style={{ flex: 1, position: "relative", minHeight: 40 }}>
                <GradeMeses totalMeses={meses.length} />
                {f.startDate && f.targetDate ? (
                  <BarraSimples
                    inicioPct={posicaoPercentual(f.startDate, inicioMs, fimMs)}
                    fimPct={posicaoPercentual(f.targetDate, inicioMs, fimMs)}
                    cor={corDeEstadoDevOps(f.state).fg}
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
      </div>
    </div>
  );
}

function BarraSimples({ inicioPct, fimPct, cor, label }: { inicioPct: number; fimPct: number; cor: string; label: string }) {
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
        height: 18,
        borderRadius: 6,
        background: cor,
        boxShadow: "0 1px 2px rgba(20,16,12,.15)",
      }}
    />
  );
}

function BarraComProgresso({
  inicioPct,
  fimPct,
  cor,
  progresso,
  label,
}: {
  inicioPct: number;
  fimPct: number;
  cor: string;
  progresso: number;
  label: string;
}) {
  const largura = Math.max(fimPct - inicioPct, 6);
  return (
    <div
      title={label}
      style={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        left: `${inicioPct}%`,
        width: `${largura}%`,
        height: 24,
        borderRadius: 6,
        background: cor,
        boxShadow: "0 1px 2px rgba(20,16,12,.2)",
        display: "flex",
        alignItems: "center",
        paddingLeft: 10,
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{progresso}% concluído</span>
      <span
        style={{
          position: "absolute",
          right: -4,
          top: "50%",
          transform: "translateY(-50%)",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#fff",
          border: `2px solid ${cor}`,
        }}
      />
    </div>
  );
}

function ModalDescricaoEpic({ epic, onFechar }: { epic: EpicRoadmap; onFechar: () => void }) {
  return (
    <div
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22,19,15,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="kmm-card"
        style={{ maxWidth: 560, width: "100%", maxHeight: "80vh", overflowY: "auto", padding: 22 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>EPIC #{epic.id}</div>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 17, color: C.text, marginTop: 2 }}>{epic.titulo}</div>
          </div>
          <button
            onClick={onFechar}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ fontSize: 13, color: C.text, marginTop: 16, whiteSpace: "pre-line", lineHeight: 1.5 }}>
          {epic.descricao || "Sem descrição cadastrada no Azure DevOps."}
        </div>
      </div>
    </div>
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

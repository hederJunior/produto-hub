"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3, Calendar, ChevronDown, ChevronUp, Clock, Download, Eraser, Flag, Gauge, Maximize2, X } from "lucide-react";
import { useProduto } from "@/components/ProdutoContext";
import { C, corDaArea, corDeEstadoDevOps, corDeStatus, corDoDev, estadoIndicaConcluido } from "@/lib/kmm-theme";

// Estilo dos eixos/tooltip do recharts, igual ao já usado em app/(app)/page.tsx — mantém os
// gráficos do app com a mesma cara (usado no painel "Esforço alocado por Sprint").
const axisTick = { fill: C.muted, fontSize: 10, fontFamily: "'Hanken Grotesk',sans-serif" };
const tipStyle = {
  background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 12, boxShadow: "0 6px 18px rgba(0,0,0,.08)",
};

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
  tipo: string;
  produto: string;
  areaPath: string;
  state: string;
  prioridade: number | null;
  spEstimados: number | null;
  spReal: number | null;
  sprint: string;
  responsavel: { nome: string; avatarUrl: string | null } | null;
};

/** Aba "Comitês" (pedido por Heder em 2026-09-28) — PBIs com Data de Comitê marcada, ver
 * getDemandasComite em lib/devops-client.ts. */
type DemandaComite = {
  id: number;
  titulo: string;
  produto: string;
  areaPath: string;
  cliente: string;
  po: string;
  state: string;
  dataComite: string | null;
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

/**
 * Dropdown de multi-seleção por checkbox (mesmo padrão do MultiSelectSquad em app/(app)/page.tsx,
 * generalizado aqui pros filtros de Área e Cliente da aba Comitês — pedido por Heder em
 * 2026-09-28: antes eram <select> de escolha única). `selecionados` vazio = sem filtro ("todas"/
 * "todos"). `formatar` é opcional, pra exibir um rótulo diferente do valor usado no filtro (ex.:
 * Área mostra só o último segmento do Area Path, mas filtra pelo path completo).
 */
function MultiSelectFiltro({
  rotuloTodos,
  opcoes,
  selecionados,
  onChange,
  formatar,
}: {
  rotuloTodos: string;
  opcoes: string[];
  selecionados: string[];
  onChange: (v: string[]) => void;
  formatar?: (v: string) => string;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function alternar(opcao: string) {
    onChange(selecionados.includes(opcao) ? selecionados.filter((s) => s !== opcao) : [...selecionados, opcao]);
  }

  const rotulo =
    selecionados.length === 0
      ? rotuloTodos
      : selecionados.length === 1
        ? formatar?.(selecionados[0]) ?? selecionados[0]
        : `${selecionados.length} selecionados`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="kmm-input"
        onClick={() => setAberto((a) => !a)}
        style={{ width: "auto", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minWidth: 180, cursor: "pointer" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
        <ChevronDown size={14} color={C.muted} style={{ flexShrink: 0 }} />
      </button>
      {aberto && (
        <div
          className="kmm-card"
          style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 240, maxHeight: 280, overflowY: "auto", padding: 8 }}
        >
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}
          >
            <input type="checkbox" checked={selecionados.length === 0} onChange={() => onChange([])} />
            {rotuloTodos}
          </label>
          {opcoes.map((op) => (
            <label key={op} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={selecionados.includes(op)} onChange={() => alternar(op)} />
              {formatar?.(op) ?? op}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

type Visao = "roadmap" | "sprints" | "comites";

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
  const [sprintSelecionada, setSprintSelecionada] = useState("todas");
  const [areaSelecionadaSprints, setAreaSelecionadaSprints] = useState("todas");
  const [painelEsforcoAberto, setPainelEsforcoAberto] = useState(false);

  const [demandasComite, setDemandasComite] = useState<DemandaComite[]>([]);
  const [carregandoComites, setCarregandoComites] = useState(true);
  const [erroComites, setErroComites] = useState<string | null>(null);
  // Arrays vazios = "todas"/"todos" (sem filtro). Multi-seleção pedida por Heder em 2026-09-28,
  // no mesmo padrão do MultiSelectSquad já usado no painel de indicadores (app/(app)/page.tsx).
  const [areasSelecionadasComites, setAreasSelecionadasComites] = useState<string[]>([]);
  const [clientesSelecionadosComites, setClientesSelecionadosComites] = useState<string[]>([]);
  // Bloco de filtro por Data de Comitê, no mesmo estilo do card "CREATED DATE" do painel de
  // indicadores (app/(app)/page.tsx) — pedido por Heder em 2026-09-28.
  const [dataInicioComites, setDataInicioComites] = useState("");
  const [dataFimComites, setDataFimComites] = useState("");
  const [dataComitesColapsada, setDataComitesColapsada] = useState(false);

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
    // O filtro de produto do header agora reflete aqui também (pedido do Heder em 2026-09-28).
    fetch(`/api/roadmap/tarefas?produto=${produto}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (j.erro) setErroSprints(j.erro);
        setTarefas(j.tarefas ?? []);
      })
      .catch(() => setErroSprints("Não foi possível carregar as sprints do Azure DevOps."))
      .finally(() => setCarregandoSprints(false));
  }, [produto]);

  useEffect(() => {
    setCarregandoComites(true);
    setErroComites(null);
    // Mesmo padrão de produto do header já usado nas outras abas (pedido em 2026-09-28).
    fetch(`/api/roadmap/comites?produto=${produto}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (j.erro) setErroComites(j.erro);
        setDemandasComite(j.demandas ?? []);
      })
      .catch(() => setErroComites("Não foi possível carregar as demandas de comitê do Azure DevOps."))
      .finally(() => setCarregandoComites(false));
  }, [produto]);

  const areasDisponiveis = useMemo(() => Array.from(new Set(epicos.map((e) => e.areaPath))).sort(), [epicos]);

  const epicosExibidos = useMemo(
    () => (areaSelecionada === "todas" ? epicos : epicos.filter((e) => e.areaPath === areaSelecionada)),
    [epicos, areaSelecionada]
  );

  const sprintsDisponiveis = useMemo(
    () =>
      Array.from(new Set(tarefas.map((t) => t.sprint))).sort((a, b) => {
        const [amaj, amin] = chaveOrdenacaoSprint(a);
        const [bmaj, bmin] = chaveOrdenacaoSprint(b);
        return amaj !== bmaj ? amaj - bmaj : amin - bmin;
      }),
    [tarefas]
  );
  const areasDisponiveisSprints = useMemo(() => Array.from(new Set(tarefas.map((t) => t.areaPath))).sort(), [tarefas]);

  const tarefasExibidas = useMemo(
    () =>
      tarefas.filter(
        (t) =>
          (sprintSelecionada === "todas" || t.sprint === sprintSelecionada) &&
          (areaSelecionadaSprints === "todas" || t.areaPath === areaSelecionadaSprints)
      ),
    [tarefas, sprintSelecionada, areaSelecionadaSprints]
  );

  const areasDisponiveisComites = useMemo(() => Array.from(new Set(demandasComite.map((d) => d.areaPath))).sort(), [demandasComite]);
  const clientesDisponiveis = useMemo(
    () => Array.from(new Set(demandasComite.map((d) => d.cliente).filter(Boolean))).sort(),
    [demandasComite]
  );
  const demandasExibidas = useMemo(
    () =>
      demandasComite.filter((d) => {
        if (areasSelecionadasComites.length && !areasSelecionadasComites.includes(d.areaPath)) return false;
        if (clientesSelecionadosComites.length && !clientesSelecionadosComites.includes(d.cliente)) return false;
        if (dataInicioComites && (!d.dataComite || d.dataComite < dataInicioComites)) return false;
        // dataComite vem com horário (ISO) — compara só a parte de data (10 chars) contra o
        // "até" do filtro pra não excluir o próprio dia final por causa do horário.
        if (dataFimComites && (!d.dataComite || d.dataComite.slice(0, 10) > dataFimComites)) return false;
        return true;
      }),
    [demandasComite, areasSelecionadasComites, clientesSelecionadosComites, dataInicioComites, dataFimComites]
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

  /**
   * Exporta pra Excel exatamente o que está filtrado em tela na aba Sprints (produto do header +
   * sprint + área selecionados aqui) — pedido do Heder em 2026-09-28. Usa a lib "xlsx" (já é
   * dependência do projeto, usada hoje só pra IMPORTAR planilha de clientes) via import dinâmico,
   * pra não engordar o bundle inicial da página com uma lib que só roda quando o botão é clicado.
   */
  async function exportarExcelSprints() {
    const XLSX = await import("xlsx");
    const linhas = tarefasExibidas.map((t) => ({
      Sprint: t.sprint,
      Título: t.titulo,
      Tipo: t.tipo,
      Área: t.areaPath.split("\\").pop() || t.areaPath,
      Responsável: t.responsavel?.nome ?? "Sem responsável",
      Status: t.state,
      Prioridade: infoPrioridade(t.prioridade).label,
      "SP Estimados": t.spEstimados ?? "",
      "SP Real": t.spReal ?? "",
    }));
    const planilha = XLSX.utils.json_to_sheet(linhas);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, "Sprints");
    const dataArquivo = agora ? `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}` : "export";
    XLSX.writeFile(livro, `sprints-${produto.toLowerCase()}-${dataArquivo}.xlsx`);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>Roadmap e entregas</h1>
          <p style={{ color: C.muted, marginTop: 4, marginBottom: 0 }}>
            {visao === "roadmap"
              ? "Cronograma estratégico de desenvolvimento, marcos e entregas do time de Produto."
              : "Sincronizado com o Azure DevOps."}
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
        ) : visao === "sprints" ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 20, color: C.text }}>
                  Sprints {produtoLabelFooter}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  Tasks e Bugs da Sprint 8.16 em diante.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <select className="kmm-input" style={{ width: "auto" }} value={sprintSelecionada} onChange={(e) => setSprintSelecionada(e.target.value)}>
                  <option value="todas">Todas as sprints</option>
                  {sprintsDisponiveis.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  className="kmm-input"
                  style={{ width: "auto" }}
                  value={areaSelecionadaSprints}
                  onChange={(e) => setAreaSelecionadaSprints(e.target.value)}
                >
                  <option value="todas">Todas as áreas</option>
                  {areasDisponiveisSprints.map((a) => (
                    <option key={a} value={a}>
                      {a.split("\\").pop() || a}
                    </option>
                  ))}
                </select>
                <button className="kmm-btn" onClick={exportarExcelSprints} disabled={!tarefasExibidas.length}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Download size={13} /> Exportar Excel
                  </span>
                </button>
                <button className="kmm-btn" onClick={() => setPainelEsforcoAberto(true)}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <BarChart3 size={13} /> Esforço por sprint
                  </span>
                </button>
              </div>
            </div>
            {carregandoSprints && <p style={{ color: C.muted }}>Carregando sprints do Azure DevOps…</p>}
            {erroSprints && (
              <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>
                {erroSprints}
              </div>
            )}
            {!carregandoSprints && !erroSprints && tarefasExibidas.length === 0 && (
              <p style={{ color: C.muted }}>Nenhuma Task ou Bug encontrada para os filtros selecionados.</p>
            )}
            {!carregandoSprints && !erroSprints && tarefasExibidas.length > 0 && <SprintsAlocadas tarefas={tarefasExibidas} />}
          </>
        ) : (
          <>
            {/* Bloco de filtro por Data de Comitê, no mesmo estilo do card "CREATED DATE" do
                painel de indicadores (app/(app)/page.tsx: kmm-card colapsável + par de inputs
                de data + botão de limpar) — pedido por Heder em 2026-09-28. */}
            <div className="kmm-card" style={{ maxWidth: 380, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: ".04em" }}>
                  DATA DE COMITÊ
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {(dataInicioComites || dataFimComites) && (
                    <button
                      className="kmm-btn"
                      style={{ padding: 6 }}
                      title="Limpar período"
                      onClick={() => { setDataInicioComites(""); setDataFimComites(""); }}
                    >
                      <Eraser size={13} />
                    </button>
                  )}
                  <button
                    className="kmm-btn"
                    style={{ padding: 6 }}
                    title={dataComitesColapsada ? "Expandir" : "Recolher"}
                    onClick={() => setDataComitesColapsada((v) => !v)}
                  >
                    <ChevronDown
                      size={13}
                      style={{ transform: dataComitesColapsada ? "rotate(-90deg)" : "none", transition: "transform .15s" }}
                    />
                  </button>
                </div>
              </div>
              {!dataComitesColapsada && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input
                    type="date"
                    className="kmm-input"
                    style={{ flex: 1 }}
                    value={dataInicioComites}
                    onChange={(e) => setDataInicioComites(e.target.value)}
                  />
                  <input
                    type="date"
                    className="kmm-input"
                    style={{ flex: 1 }}
                    value={dataFimComites}
                    onChange={(e) => setDataFimComites(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 20, color: C.text }}>
                  Comitês {produtoLabelFooter}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  Demandas (PBIs) com Data de Comitê marcada no Azure DevOps.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <MultiSelectFiltro
                  rotuloTodos="Todas as áreas"
                  opcoes={areasDisponiveisComites}
                  selecionados={areasSelecionadasComites}
                  onChange={setAreasSelecionadasComites}
                  formatar={(a) => a.split("\\").pop() || a}
                />
                <MultiSelectFiltro
                  rotuloTodos="Todos os clientes"
                  opcoes={clientesDisponiveis}
                  selecionados={clientesSelecionadosComites}
                  onChange={setClientesSelecionadosComites}
                />
              </div>
            </div>
            {carregandoComites && <p style={{ color: C.muted }}>Carregando demandas de comitê do Azure DevOps…</p>}
            {erroComites && (
              <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>
                {erroComites}
              </div>
            )}
            {!carregandoComites && !erroComites && demandasExibidas.length === 0 && (
              <p style={{ color: C.muted }}>Nenhuma demanda com Data de Comitê encontrada para os filtros selecionados.</p>
            )}
            {!carregandoComites && !erroComites && demandasExibidas.length > 0 && <DemandasComiteLista demandas={demandasExibidas} />}
          </>
        )}
      </div>

      {epicDescricao && <ModalDescricaoEpic epic={epicDescricao} onFechar={() => setEpicDescricaoAberta(null)} />}
      {painelEsforcoAberto && (
        <PainelEsforcoPorSprint
          tarefas={tarefas}
          areasDisponiveis={areasDisponiveisSprints}
          onFechar={() => setPainelEsforcoAberto(false)}
        />
      )}
    </div>
  );
}

/** Alterna entre a visão de Road Map (Gantt por Epic) e a de Sprints alocadas (Tasks por sprint). */
function VisaoFiltro({ visao, setVisao }: { visao: Visao; setVisao: (v: Visao) => void }) {
  const opcoes: { valor: Visao; label: string }[] = [
    { valor: "roadmap", label: "Road Map" },
    { valor: "sprints", label: "Sprints" },
    { valor: "comites", label: "Comitês" },
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

/**
 * Painel "Esforço alocado por Sprint" (botão na aba Sprints, pedido em 2026-09-28): gráfico de
 * barras lado a lado (não empilhadas — cada dev é uma barra própria dentro da sprint) com a soma
 * do Effort (mesmo campo usado como "SP Estimados" na tabela de Sprints — não existe Story Points
 * nativo em Task/Bug, decisão já registrada em 2026-09-23) por desenvolvedor, agrupado por
 * Sprint. Só plota depois que uma Area é escolhida no filtro do canto superior esquerdo do
 * painel — sem área selecionada, mostra um aviso em vez do gráfico (pedido explícito do Heder).
 *
 * Usa TODAS as tarefas carregadas pro produto do header (não as já filtradas por Sprint/Área da
 * tabela por trás do botão) — assim o gráfico sempre mostra todas as sprints de uma vez, como no
 * rascunho enviado, independente do filtro de Sprint que estiver ativo na tabela.
 */
function PainelEsforcoPorSprint({
  tarefas,
  areasDisponiveis,
  onFechar,
}: {
  tarefas: TaskAlocada[];
  areasDisponiveis: string[];
  onFechar: () => void;
}) {
  const [area, setArea] = useState("");
  // Isolamento de dev via clique na legenda (pedido em 2026-09-28): [] = mostra todos; clique
  // normal isola só aquele dev (substitui a seleção anterior); Ctrl/Cmd+clique acumula, permitindo
  // isolar vários devs de uma vez (pedido em 2026-09-28, ajuste posterior). Clicar de novo no
  // único dev isolado limpa o filtro (volta a mostrar todos). Reseta ao trocar de Área, já que a
  // lista de devs muda.
  const [devsIsolados, setDevsIsolados] = useState<string[]>([]);

  const tarefasDaArea = useMemo(() => (area ? tarefas.filter((t) => t.areaPath === area) : []), [tarefas, area]);

  const devs = useMemo(
    () => Array.from(new Set(tarefasDaArea.map((t) => t.responsavel?.nome ?? "Sem responsável"))).sort(),
    [tarefasDaArea]
  );

  useEffect(() => setDevsIsolados([]), [area]);

  const devsVisiveis = devsIsolados.length ? devs.filter((d) => devsIsolados.includes(d)) : devs;

  const dadosGrafico = useMemo(() => {
    const porSprint = new Map<string, Record<string, number>>();
    for (const t of tarefasDaArea) {
      const dev = t.responsavel?.nome ?? "Sem responsável";
      const linha = porSprint.get(t.sprint) ?? {};
      linha[dev] = (linha[dev] ?? 0) + (t.spEstimados ?? 0);
      porSprint.set(t.sprint, linha);
    }
    return Array.from(porSprint.entries())
      .sort(([a], [b]) => {
        const [amaj, amin] = chaveOrdenacaoSprint(a);
        const [bmaj, bmin] = chaveOrdenacaoSprint(b);
        return amaj !== bmaj ? amaj - bmaj : amin - bmin;
      })
      .map(([sprint, valores]) => ({ sprint: sprint.replace(/^Sprint\s*/i, ""), ...valores }));
  }, [tarefasDaArea]);

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
        style={{ maxWidth: 820, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: 22 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <select className="kmm-input" style={{ width: "auto", minWidth: 240 }} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Selecione uma área…</option>
            {areasDisponiveis.map((a) => (
              <option key={a} value={a}>
                {a.split("\\").pop() || a}
              </option>
            ))}
          </select>
          <button
            onClick={onFechar}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 18, color: C.text }}>
            Esforço alocado por sprint{area ? ` — Área: ${area.split("\\").pop()}` : ""}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Soma do Effort por desenvolvedor, agrupado por Sprint.
          </div>
        </div>

        {!area && (
          <p style={{ color: C.muted, marginTop: 24 }}>Selecione uma área no filtro acima para visualizar o gráfico.</p>
        )}
        {area && dadosGrafico.length === 0 && (
          <p style={{ color: C.muted, marginTop: 24 }}>Nenhum dado de esforço encontrado para essa área.</p>
        )}
        {area && dadosGrafico.length > 0 && (
          <div style={{ height: 380, marginTop: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosGrafico} margin={{ top: 24, right: 16, left: -10, bottom: 0 }} barGap={4}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="sprint" stroke={C.border} tick={axisTick} />
                <YAxis stroke={C.border} tick={axisTick} allowDecimals={false} width={34} />
                <Tooltip contentStyle={tipStyle} cursor={{ fill: "rgba(0,0,0,.03)" }} />
                {devsVisiveis.map((dev) => (
                  <Bar
                    key={dev}
                    dataKey={dev}
                    name={dev}
                    fill={corDoDev(dev)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                    label={{ position: "top", fill: C.muted, fontSize: 11 }}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {area && dadosGrafico.length > 0 && (
          <LegendaFiltroDev
            devs={devs}
            devsIsolados={devsIsolados}
            onAlternar={(dev, ctrl) =>
              setDevsIsolados((atual) => {
                if (ctrl) return atual.includes(dev) ? atual.filter((d) => d !== dev) : [...atual, dev];
                return atual.length === 1 && atual[0] === dev ? [] : [dev];
              })
            }
          />
        )}
      </div>
    </div>
  );
}

/**
 * Legenda custom do painel "Esforço alocado por Sprint" que atua como filtro (pedido em
 * 2026-09-28): clique normal num dev isola ele (mostra só as barras dele no gráfico), substituindo
 * qualquer isolamento anterior; clicar de novo no único dev já isolado limpa o filtro e volta a
 * mostrar todos. Ctrl/Cmd+clique acumula: soma ou remove aquele dev da seleção sem mexer nos
 * demais, permitindo isolar vários de uma vez (ajuste pedido em 2026-09-28). Lista SEMPRE todos os
 * devs da área (mesmo os ocultos no momento), pra dar pra voltar/trocar o isolamento a qualquer
 * clique — por isso não é a <Legend> nativa do recharts (o payload dela só reflete as <Bar>
 * renderizadas no momento, e as ocultas somem da lista).
 */
function LegendaFiltroDev({
  devs,
  devsIsolados,
  onAlternar,
}: {
  devs: string[];
  devsIsolados: string[];
  onAlternar: (dev: string, ctrl: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, justifyContent: "center" }}>
      {devs.map((dev) => {
        const isolado = devsIsolados.includes(dev);
        const ativo = !devsIsolados.length || isolado;
        return (
          <button
            key={dev}
            type="button"
            onClick={(e) => onAlternar(dev, e.ctrlKey || e.metaKey)}
            className="kmm-chip"
            style={{
              cursor: "pointer",
              opacity: ativo ? 1 : 0.4,
              fontWeight: isolado ? 700 : 600,
              borderColor: isolado ? corDoDev(dev) : C.border,
            }}
            title={
              isolado
                ? "Clique para mostrar todos · Ctrl+clique para tirar só este da seleção"
                : `Clique para isolar ${dev} · Ctrl+clique para somar à seleção`
            }
          >
            <span style={{ width: 9, height: 9, borderRadius: 2, background: corDoDev(dev), display: "inline-block" }} />
            {dev}
          </button>
        );
      })}
    </div>
  );
}

const COLUNAS_SPRINT = "1fr 150px 160px 140px 110px 90px 110px 110px";

/** Cor do chip de Tipo (Task/Bug) — Bug em vermelho pra chamar atenção num board misto. */
function infoTipo(tipo: string): { bg: string; fg: string } {
  if (tipo.toLowerCase() === "bug") return { bg: "#FBE7E4", fg: C.red };
  return { bg: "#E7F0FA", fg: C.blue };
}

/** Extrai (major, minor) de "Sprint 8.16" pra ordenar sprints numericamente, não por string
 * (string sort erraria: "Sprint 8.2" > "Sprint 8.16" alfabeticamente, mas 8.2 é anterior). */
function chaveOrdenacaoSprint(label: string): [number, number] {
  const m = /(\d+)\.(\d+)/.exec(label);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

/**
 * Seção "Sprints": Tasks e Bugs agrupados por Sprint (System.IterationLevel3), no estilo do
 * protótipo enviado pelo Heder — usando Effort/Completed Work como SP Estimados/SP Real
 * (Task/Bug não tem Story Points, decisão tomada com o Heder em 2026-09-23, ver
 * lib/devops-client.ts). Cada bloco de sprint é colapsável (pedido em 2026-09-28), e a coluna
 * Resp. mostra só o nome (sem avatar, também pedido em 2026-09-28 — a versão anterior mostrava a
 * foto vinda do Azure DevOps).
 */
function SprintsAlocadas({ tarefas }: { tarefas: TaskAlocada[] }) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const porSprint = useMemo(() => {
    const grupos: Record<string, TaskAlocada[]> = {};
    for (const t of tarefas) {
      grupos[t.sprint] ??= [];
      grupos[t.sprint].push(t);
    }
    return grupos;
  }, [tarefas]);

  const nomesSprints = useMemo(
    () =>
      Object.keys(porSprint).sort((a, b) => {
        const [amaj, amin] = chaveOrdenacaoSprint(a);
        const [bmaj, bmin] = chaveOrdenacaoSprint(b);
        return amaj !== bmaj ? amaj - bmaj : amin - bmin;
      }),
    [porSprint]
  );

  return (
    <div>
      {nomesSprints.map((sprint) => {
        const itens = porSprint[sprint];
        const somaEstimados = itens.reduce((acc, t) => acc + (t.spEstimados ?? 0), 0);
        const somaReal = itens.reduce((acc, t) => acc + (t.spReal ?? 0), 0);
        const aberto = abertos[sprint] ?? true;

        return (
          <div key={sprint} className="kmm-card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
            <button
              onClick={() => setAbertos((a) => ({ ...a, [sprint]: !(a[sprint] ?? true) }))}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                padding: "14px 18px 8px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {aberto ? <ChevronUp size={14} color={C.muted} /> : <ChevronDown size={14} color={C.muted} />}
              <span style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 16, color: C.orange }}>{sprint}</span>
              <span style={{ fontSize: 11.5, color: C.muted }}>
                {itens.length} item{itens.length > 1 ? "s" : ""}
              </span>
            </button>

            <div style={{ display: "grid", gridTemplateRows: aberto ? "1fr" : "0fr", transition: "grid-template-rows 220ms ease" }}>
              <div style={{ overflow: "hidden" }}>
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
                  <div>Área</div>
                  <div>Resp.</div>
                  <div>Status</div>
                  <div>Prioridade</div>
                  <div>Tipo</div>
                  <div style={{ textAlign: "right" }}>SP Estimados</div>
                  <div style={{ textAlign: "right" }}>SP Real</div>
                </div>

                {itens.map((t) => {
                  const prio = infoPrioridade(t.prioridade);
                  const status = corDeEstadoDevOps(t.state);
                  const tipo = infoTipo(t.tipo);
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
                      <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.areaPath.split("\\").pop() || t.areaPath || "—"}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.responsavel?.nome ?? "Sem responsável"}
                      </div>
                      <span className="kmm-chip" style={{ background: status.bg, color: status.fg, borderColor: "transparent" }}>
                        {t.state}
                      </span>
                      <span className="kmm-chip" style={{ background: prio.bg, color: prio.fg, borderColor: "transparent" }}>
                        {prio.label}
                      </span>
                      <span className="kmm-chip" style={{ background: tipo.bg, color: tipo.fg, borderColor: "transparent" }}>
                        {t.tipo}
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
                  <div />
                  <div />
                  <div style={{ fontSize: 11, color: C.muted, textAlign: "right", fontWeight: 700, alignSelf: "center" }}>Soma</div>
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: C.text }}>{somaEstimados}</div>
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: C.text }}>{somaReal}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const COLUNAS_COMITE = "110px 1fr 150px 140px 130px 170px";

/**
 * Lista "Demandas Programadas" da aba Comitês — PBIs com Data de Comitê marcada, no estilo do
 * dashboard Power BI que o Heder mandou de referência (2026-09-28): lista simples, ordenada por
 * Data de Comitê (ordem que já vem da API — ver getDemandasComite em lib/devops-client.ts), sem
 * agrupamento por bloco. Colunas confirmadas com o Heder: Data Comitê, Título, Cliente, PO,
 * Status, Área (Prioridade ficou de fora).
 */
function DemandasComiteLista({ demandas }: { demandas: DemandaComite[] }) {
  return (
    <div className="kmm-card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: COLUNAS_COMITE,
          padding: "10px 18px",
          borderBottom: `1px solid ${C.border}`,
          fontSize: 11,
          fontWeight: 700,
          color: C.muted,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        <div>Data Comitê</div>
        <div>Título</div>
        <div>Cliente</div>
        <div>PO</div>
        <div>Status</div>
        <div>Área</div>
      </div>
      {demandas.map((d) => {
        const status = corDeEstadoDevOps(d.state);
        return (
          <div
            key={d.id}
            style={{
              display: "grid",
              gridTemplateColumns: COLUNAS_COMITE,
              padding: "10px 18px",
              borderBottom: `1px solid ${C.border}`,
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12.5, color: C.text, fontVariantNumeric: "tabular-nums" }}>{formatarData(d.dataComite)}</div>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
              #{d.id} · {d.titulo}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{d.cliente || "—"}</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{d.po || "—"}</div>
            <div>
              <span className="kmm-chip" style={{ background: status.bg, color: status.fg, borderColor: "transparent" }}>
                {d.state}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{d.areaPath.split("\\").pop() || d.areaPath}</div>
          </div>
        );
      })}
    </div>
  );
}

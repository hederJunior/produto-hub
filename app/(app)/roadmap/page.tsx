"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3, Calendar, CalendarRange, ChevronDown, ChevronRight, ChevronUp, Clock, Download, Eraser, Flag, Gauge, ListTodo, Map as MapIcon, Maximize2, Users, X } from "lucide-react";
import { useProduto } from "@/components/ProdutoContext";
import { C, corDaArea, corDeAreaTabela, corDeEstadoDevOps, corDeStatus, corDoDev, estadoIndicaConcluido, infoPrioridade } from "@/lib/kmm-theme";
import { chaveDia, diasEntreChaves, formatarChaveDia } from "@/lib/datas";
import BacklogEsteirasClientes, { type OrdemBacklog } from "@/components/BacklogEsteirasClientes";
import type { ItemBacklog } from "@/lib/backlog";
import PainelCapacidade from "@/components/PainelCapacidade";
import PageHeader from "@/components/PageHeader";

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
  pbiPaiId: number | null;
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
  createdDate: string;
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

const LARGURA_COLUNA_LABEL = 300;

/** Janelas fixas dos 4 trimestres de 2026 pro filtro por Quarter do Road Map (pedido por Heder em
 * 2026-09-29) — lista fixa (só 2026), não derivada dos Epics carregados. */
const QUARTERS_FILTRO: { id: string; label: string; inicio: Date; fim: Date }[] = [
  { id: "2026-1", label: "Q1-2026", inicio: new Date(2026, 0, 1), fim: new Date(2026, 2, 31, 23, 59, 59) },
  { id: "2026-2", label: "Q2-2026", inicio: new Date(2026, 3, 1), fim: new Date(2026, 5, 30, 23, 59, 59) },
  { id: "2026-3", label: "Q3-2026", inicio: new Date(2026, 6, 1), fim: new Date(2026, 8, 30, 23, 59, 59) },
  { id: "2026-4", label: "Q4-2026", inicio: new Date(2026, 9, 1), fim: new Date(2026, 11, 31, 23, 59, 59) },
];

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

/**
 * Filtro por trimestre do Road Map (toggle multi-seleção, pedido por Heder em 2026-09-29): cada
 * botão liga/desliga aquele trimestre; com nenhum selecionado, mostra todos os Epics (sem filtro).
 * Lista fixa de QUARTERS_FILTRO — não deriva dos dados carregados.
 */
function FiltroTrimestre({ selecionados, onChange }: { selecionados: string[]; onChange: (v: string[]) => void }) {
  function alternar(id: string) {
    onChange(selecionados.includes(id) ? selecionados.filter((s) => s !== id) : [...selecionados, id]);
  }
  return (
    <div className="kmm-seg">
      {QUARTERS_FILTRO.map((q) => (
        <div key={q.id} className={`kmm-seg-item${selecionados.includes(q.id) ? " active" : ""}`} onClick={() => alternar(q.id)}>
          {q.label}
        </div>
      ))}
    </div>
  );
}

type Visao = "backlog" | "comites" | "sprints" | "roadmap";
type ModoSprints = "alocacao" | "demandas" | "lista";

const SEM_CLIENTE = "Sem cliente";

/** Cliente da Task/Bug = Custom.Cliente do PBI pai; sem PBI pai ou sem cliente preenchido → "Sem cliente". */
function clienteDaTarefa(t: { pbiPaiId: number | null }, pais: Record<number, { cliente?: string }>): string {
  return (t.pbiPaiId != null ? pais[t.pbiPaiId]?.cliente : "") || SEM_CLIENTE;
}

export default function RoadmapPage() {
  const { produto } = useProduto();
  const [visao, setVisao] = useState<Visao>("roadmap");

  const [epicos, setEpicos] = useState<EpicRoadmap[]>([]);
  const [carregandoRoadmap, setCarregandoRoadmap] = useState(true);
  const [erroRoadmap, setErroRoadmap] = useState<string | null>(null);
  const [areaSelecionada, setAreaSelecionada] = useState("todas");
  // Filtro por trimestre do Road Map (pedido por Heder em 2026-09-29): toggle multi-seleção, só
  // pros 4 trimestres de 2026 (não é derivado dos dados — lista fixa, como pedido). Vazio = sem
  // filtro (mostra todos os Epics, de qualquer ano).
  const [quartersSelecionados, setQuartersSelecionados] = useState<string[]>([]);
  const [epicDescricaoAberta, setEpicDescricaoAberta] = useState<number | null>(null);
  const [featuresAbertas, setFeaturesAbertas] = useState<Record<number, boolean>>({});

  const [tarefas, setTarefas] = useState<TaskAlocada[]>([]);
  const [carregandoSprints, setCarregandoSprints] = useState(true);
  const [erroSprints, setErroSprints] = useState<string | null>(null);
  // Arrays vazios = "todas" (sem filtro). Multi-seleção pedida por Heder em 2026-09-29, mesmo
  // padrão do MultiSelectFiltro já usado em Comitês.
  const [sprintsSelecionadas, setSprintsSelecionadas] = useState<string[]>([]);
  const [areasSelecionadasSprints, setAreasSelecionadasSprints] = useState<string[]>([]);
  // Levantado pra cá (antes vivia dentro de SprintsAlocadas) pra entrar no mesmo bloco de filtros
  // do cabeçalho da aba — pedido por Heder em 2026-09-29 (reposicionamento dos filtros).
  const [agruparSprintsPor, setAgruparSprintsPor] = useState<CampoAgrupamento>("nenhum");
  const [painelEsforcoAberto, setPainelEsforcoAberto] = useState(false);
  const [painelCapacidadeAberto, setPainelCapacidadeAberto] = useState(false);

  // Backlog > Esteiras Clientes (pedido por Heder em 2026-10-14). `ordemBacklog` null = ordem por ID.
  const [backlogItens, setBacklogItens] = useState<ItemBacklog[]>([]);
  const [carregandoBacklog, setCarregandoBacklog] = useState(true);
  const [erroBacklog, setErroBacklog] = useState<string | null>(null);
  const [ordemBacklog, setOrdemBacklog] = useState<OrdemBacklog | null>(null);

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

  // Tela da seção Sprints: "alocacao" (grade Recurso × Iteration, padrão) ou "lista" (tabela por sprint).
  const [modoSprints, setModoSprints] = useState<ModoSprints>("alocacao");
  // Pontos de encaixe na barra de filtros do painel, onde a tela "Alocação por sprint" injeta (portal)
  // os próprios filtros e ações — pra ficarem na mesma linha das outras seções.
  // Filtro de CLIENTE das 3 telas de Sprints (pedido por Heder em 2026-10-15). O cliente é o
  // Custom.Cliente do PBI pai da Task/Bug (não existe na Task), então os PBIs pai são buscados aqui,
  // uma vez, e compartilhados pelas três telas. Vazio = todos os clientes.
  const [paisSprints, setPaisSprints] = useState<Record<number, { titulo: string; tipo: string; estado: string; cliente?: string }>>({});
  const [carregandoPaisSprints, setCarregandoPaisSprints] = useState(false);
  const [clientesSprints, setClientesSprints] = useState<string[]>([]);
  const [slotFiltros, setSlotFiltros] = useState<HTMLElement | null>(null);
  const [slotAcoes, setSlotAcoes] = useState<HTMLElement | null>(null);
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
        // "detalhe" é diagnóstico temporário (Heder, 2026-09-30) — ver comentário em
        // app/api/roadmap/tarefas/route.ts.
        if (j.erro) setErroSprints(j.detalhe ? `${j.erro} (${j.detalhe})` : j.erro);
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

  // Títulos/clientes dos PBIs pai das Tasks/Bugs — só quando a seção Sprints é aberta.
  useEffect(() => {
    if (visao !== "sprints") return;
    const ids = Array.from(new Set(tarefas.map((t) => t.pbiPaiId).filter((n): n is number => n != null)));
    if (!ids.length) return;
    let cancelado = false;
    setCarregandoPaisSprints(true);
    fetch("/api/roadmap/pais", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then((res) => res.json())
      .then((j) => {
        if (!cancelado) setPaisSprints(j.pais ?? {});
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setCarregandoPaisSprints(false);
      });
    return () => {
      cancelado = true;
    };
  }, [tarefas, visao]);

  // Trocar de produto muda as Tasks: a seleção de clientes anterior não vale mais.
  useEffect(() => setClientesSprints([]), [produto]);

  useEffect(() => {
    setCarregandoBacklog(true);
    setErroBacklog(null);
    fetch(`/api/roadmap/backlog?produto=${produto}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (j.erro) setErroBacklog(j.detalhe ? `${j.erro} (${j.detalhe})` : j.erro);
        setBacklogItens(j.itens ?? []);
      })
      .catch(() => setErroBacklog("Não foi possível carregar o backlog do Azure DevOps."))
      .finally(() => setCarregandoBacklog(false));
  }, [produto]);

  const areasDisponiveis = useMemo(() => Array.from(new Set(epicos.map((e) => e.areaPath))).sort(), [epicos]);

  const epicosExibidos = useMemo(() => {
    let lista = areaSelecionada === "todas" ? epicos : epicos.filter((e) => e.areaPath === areaSelecionada);
    if (quartersSelecionados.length) {
      const janelas = QUARTERS_FILTRO.filter((q) => quartersSelecionados.includes(q.id));
      lista = lista.filter((e) => {
        // Epic sem Start/Target Date não tem como ser posicionado num trimestre — fica de fora
        // quando o filtro está ativo (mesmo comportamento do "Sem Start/Target Date cadastrada"
        // que já aparece pra Features sem data, só que aqui filtrando o Epic inteiro).
        if (!e.startDate || !e.targetDate) return false;
        const inicioEpic = new Date(e.startDate).getTime();
        const fimEpic = new Date(e.targetDate).getTime();
        return janelas.some((q) => inicioEpic <= q.fim.getTime() && fimEpic >= q.inicio.getTime());
      });
    }
    return lista;
  }, [epicos, areaSelecionada, quartersSelecionados]);

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

  // Opções do filtro de cliente: só depois de carregar os PBIs pai (antes, toda Task cairia em "Sem cliente").
  const clientesDisponiveisSprints = useMemo(
    () =>
      carregandoPaisSprints || !Object.keys(paisSprints).length
        ? []
        : Array.from(new Set(tarefas.map((t) => clienteDaTarefa(t, paisSprints)))).sort((a, b) =>
            a === SEM_CLIENTE ? 1 : b === SEM_CLIENTE ? -1 : a.localeCompare(b, "pt-BR")
          ),
    [tarefas, paisSprints, carregandoPaisSprints]
  );

  const tarefasExibidas = useMemo(
    () =>
      tarefas.filter(
        (t) =>
          (sprintsSelecionadas.length === 0 || sprintsSelecionadas.includes(t.sprint)) &&
          (areasSelecionadasSprints.length === 0 || areasSelecionadasSprints.includes(t.areaPath)) &&
          (clientesSprints.length === 0 || clientesSprints.includes(clienteDaTarefa(t, paisSprints)))
      ),
    [tarefas, sprintsSelecionadas, areasSelecionadasSprints, clientesSprints, paisSprints]
  );

  const areasDisponiveisComites = useMemo(() => Array.from(new Set(demandasComite.map((d) => d.areaPath))).sort(), [demandasComite]);
  const clientesDisponiveis = useMemo(
    () => Array.from(new Set(demandasComite.map((d) => d.cliente).filter(Boolean))).sort(),
    [demandasComite]
  );
  const demandasExibidas = useMemo(
    () =>
      demandasComite
        .filter((d) => {
          if (areasSelecionadasComites.length && !areasSelecionadasComites.includes(d.areaPath)) return false;
          if (clientesSelecionadosComites.length && !clientesSelecionadosComites.includes(d.cliente)) return false;
          // Compara pela chave de dia (YYYY-MM-DD, fuso de Brasília — o mesmo dia que o Azure
          // DevOps mostra), não pelo ISO com horário, pra não excluir o próprio dia final.
          const dia = d.dataComite ? chaveDia(d.dataComite) : "";
          if (dataInicioComites && (!dia || dia < dataInicioComites)) return false;
          if (dataFimComites && (!dia || dia > dataFimComites)) return false;
          return true;
        })
        // Ordena por Data Comitê (pedido por Heder em 2026-09-28): a API já pede ORDER BY na
        // WIQL, mas isso vale só dentro de cada TeamProject — com produto "AMBOS" os resultados
        // de KMM4 e KMM5 vêm concatenados (getDemandasComite roda um WIQL por projeto e dá
        // `.flat()` no fim), quebrando a ordem cronológica geral. Comparação de string funciona
        // porque dataComite é ISO (YYYY-MM-DDTHH:mm:ssZ).
        .sort((a, b) => (a.dataComite ?? "").localeCompare(b.dataComite ?? "") || a.id - b.id),
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
      <PageHeader
        titulo="Roadmap e entregas"
        subtitulo={
          visao === "roadmap"
            ? "Cronograma estratégico de desenvolvimento, marcos e entregas do time de Produto."
            : "Sincronizado com o Azure DevOps."
        }
      />

      <VisaoFiltro visao={visao} setVisao={setVisao} />

      {/* Painel único da seção (abas de pasta coladas nele, pedido por Heder em 2026-10-14): a barra
          de filtros/ações fica SEMPRE logo abaixo das abas, dentro do painel, igual em toda seção —
          filtros à esquerda, ações empurradas pra direita (marginLeft:auto). */}
      <div
        className="kmm-painel"
        style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "0 14px 14px 14px", padding: 18, minHeight: 260 }}
      >
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        {visao === "backlog" && (
          <>
            {/* Visões do Backlog: por enquanto só "Esteiras Clientes" (a primeira de várias previstas). */}
            <div className="kmm-seg">
              <div className="kmm-seg-item active" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Users size={13} /> Esteiras Clientes
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginLeft: "auto" }}>
              {(
                [
                  { valor: "prioridade", label: "Ordenar por prioridade" },
                  { valor: "data", label: "Ordenar por data" },
                ] as { valor: OrdemBacklog; label: string }[]
              ).map((o) => (
                <button
                  key={o.valor}
                  className="kmm-btn"
                  aria-pressed={ordemBacklog === o.valor}
                  style={ordemBacklog === o.valor ? { borderColor: C.orange, color: C.orange, background: "#FFF1EA" } : undefined}
                  onClick={() => setOrdemBacklog(o.valor)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}

        {visao === "roadmap" && (
          <>
            <FiltroTrimestre selecionados={quartersSelecionados} onChange={setQuartersSelecionados} />
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
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button
                className="kmm-btn"
                onClick={() => setFeaturesAbertas(Object.fromEntries(epicosExibidos.map((e) => [e.id, true])))}
              >
                Expandir todos
              </button>
              <button
                className="kmm-btn"
                onClick={() => setFeaturesAbertas(Object.fromEntries(epicosExibidos.map((e) => [e.id, false])))}
              >
                Comprimir todos
              </button>
            </div>
          </>
        )}

        {visao === "sprints" && (
          <>
            <div className="kmm-seg">
              {(
                [
                  { valor: "alocacao", label: "Alocação por sprint", icone: <CalendarRange size={13} /> },
                  { valor: "demandas", label: "Demandas", icone: <ListTodo size={13} /> },
                  { valor: "lista", label: "Lista por sprint", icone: <Calendar size={13} /> },
                ] as { valor: ModoSprints; label: string; icone: React.ReactNode }[]
              ).map((o) => (
                <div
                  key={o.valor}
                  className={`kmm-seg-item${modoSprints === o.valor ? " active" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={() => setModoSprints(o.valor)}
                >
                  {o.icone} {o.label}
                </div>
              ))}
            </div>
            <MultiSelectFiltro
              rotuloTodos="Todos os clientes"
              opcoes={clientesDisponiveisSprints}
              selecionados={clientesSprints}
              onChange={setClientesSprints}
            />
            {modoSprints !== "lista" && <div ref={setSlotFiltros} style={{ display: "contents" }} />}
            {modoSprints === "lista" && (
              <>
                <MultiSelectFiltro
                  rotuloTodos="Todas as sprints"
                  opcoes={sprintsDisponiveis}
                  selecionados={sprintsSelecionadas}
                  onChange={setSprintsSelecionadas}
                />
                <MultiSelectFiltro
                  rotuloTodos="Todas as áreas"
                  opcoes={areasDisponiveisSprints}
                  selecionados={areasSelecionadasSprints}
                  onChange={setAreasSelecionadasSprints}
                  formatar={(a) => a.split("\\").pop() || a}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Agrupar por</span>
                  <select
                    className="kmm-input"
                    style={{ width: "auto" }}
                    value={agruparSprintsPor}
                    onChange={(e) => setAgruparSprintsPor(e.target.value as CampoAgrupamento)}
                  >
                    <option value="nenhum">Nenhum</option>
                    <option value="areaPath">Área</option>
                    <option value="responsavel">Resp.</option>
                    <option value="tipo">Tipo</option>
                  </select>
                </div>
              </>
            )}
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginLeft: "auto" }}>
              {modoSprints !== "lista" && <div ref={setSlotAcoes} style={{ display: "contents" }} />}
              {modoSprints === "lista" && (
                <button className="kmm-btn" onClick={exportarExcelSprints} disabled={!tarefasExibidas.length}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Download size={13} /> Exportar Excel
                  </span>
                </button>
              )}
              <button className="kmm-btn" onClick={() => setPainelEsforcoAberto(true)}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <BarChart3 size={13} /> Esforço por sprint
                </span>
              </button>
              <button className="kmm-btn" onClick={() => setPainelCapacidadeAberto(true)}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Users size={13} /> Planejar capacidade
                </span>
              </button>
            </div>
          </>
        )}

        {visao === "comites" && (
          <>
            {/* Data de Comitê: antes um card colapsável próprio acima da lista (estilo "CREATED DATE"
                do painel de indicadores); agora inline no cabeçalho, junto dos demais filtros
                (reposicionamento pedido por Heder em 2026-10-10). */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Data de Comitê</span>
              <input
                type="date"
                className="kmm-input"
                style={{ width: "auto" }}
                value={dataInicioComites}
                onChange={(e) => setDataInicioComites(e.target.value)}
              />
              <input
                type="date"
                className="kmm-input"
                style={{ width: "auto" }}
                value={dataFimComites}
                onChange={(e) => setDataFimComites(e.target.value)}
              />
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
            </div>
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
          </>
        )}
      </div>

      <div>
        {visao === "backlog" ? (
          <>
            {carregandoBacklog && <p style={{ color: C.muted }}>Carregando backlog do Azure DevOps…</p>}
            {erroBacklog && (
              <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>
                {erroBacklog}
              </div>
            )}
            {!carregandoBacklog && !erroBacklog && backlogItens.length === 0 && (
              <p style={{ color: C.muted }}>
                Nenhum PBI em Backlog (State e Etapa) nas squads de Esteiras Clientes para o produto selecionado. Essas squads existem apenas no KMM5.
              </p>
            )}
            {!carregandoBacklog && !erroBacklog && backlogItens.length > 0 && (
              <BacklogEsteirasClientes itens={backlogItens} ordem={ordemBacklog} hoje={agora ?? new Date()} />
            )}
          </>
        ) : visao === "roadmap" ? (
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
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 20, color: C.text }}>
                Sprints {produtoLabelFooter}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Tasks e Bugs da Sprint 8.16 em diante.
              </div>
            </div>
            {carregandoSprints && <p style={{ color: C.muted }}>Carregando sprints do Azure DevOps…</p>}
            {erroSprints && (
              <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>
                {erroSprints}
              </div>
            )}
            {modoSprints !== "lista" && !carregandoSprints && !erroSprints && (
              <PainelAlocacaoPorSprint
                modo={modoSprints}
                tarefas={tarefas}
                produto={produto}
                areasDisponiveis={areasDisponiveisSprints}
                pais={paisSprints}
                carregandoPais={carregandoPaisSprints}
                clientesFiltro={clientesSprints}
                slotFiltros={slotFiltros}
                slotAcoes={slotAcoes}
              />
            )}
            {modoSprints === "lista" && !carregandoSprints && !erroSprints && tarefasExibidas.length === 0 && (
              <p style={{ color: C.muted }}>Nenhuma Task ou Bug encontrada para os filtros selecionados.</p>
            )}
            {modoSprints === "lista" && !carregandoSprints && !erroSprints && tarefasExibidas.length > 0 && (
              <SprintsAlocadas tarefas={tarefasExibidas} agruparPor={agruparSprintsPor} />
            )}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 20, color: C.text }}>
                Comitês {produtoLabelFooter}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                PBIs em Backlog, na etapa Comitê, agrupados pela Data de Comitê.
              </div>
            </div>
            {carregandoComites && <p style={{ color: C.muted }}>Carregando demandas de comitê do Azure DevOps…</p>}
            {erroComites && (
              <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>
                {erroComites}
              </div>
            )}
            {!carregandoComites && !erroComites && demandasExibidas.length === 0 && (
              <p style={{ color: C.muted }}>Nenhum PBI em Backlog na etapa Comitê, com Data de Comitê preenchida, para os filtros selecionados.</p>
            )}
            {!carregandoComites && !erroComites && demandasExibidas.length > 0 && <DemandasComiteLista demandas={demandasExibidas} hoje={agora ?? new Date()} />}
          </>
        )}
      </div>
      </div>

      {epicDescricao && <ModalDescricaoEpic epic={epicDescricao} onFechar={() => setEpicDescricaoAberta(null)} />}
      {painelEsforcoAberto && (
        <PainelEsforcoPorSprint
          tarefas={tarefas}
          areasDisponiveis={areasDisponiveisSprints}
          onFechar={() => setPainelEsforcoAberto(false)}
        />
      )}
      <PainelCapacidade aberto={painelCapacidadeAberto} onFechar={() => setPainelCapacidadeAberto(false)} />
    </div>
  );
}

/**
 * Seletor de SEÇÃO da página (Backlog | Comitê | Sprints | Road Map), como abas de pasta coladas no
 * painel de conteúdo logo abaixo: a aba ativa se funde ao painel (mesmo fundo, sem a borda de
 * baixo, borda laranja no topo e ícone laranja); as inativas ficam num cinza-areia "recuado".
 * Escolhido pelo Heder em 2026-10-14 (opção D, com os ícones da opção C).
 */
function VisaoFiltro({ visao, setVisao }: { visao: Visao; setVisao: (v: Visao) => void }) {
  const opcoes: { valor: Visao; label: string; icone: React.ReactNode }[] = [
    { valor: "backlog", label: "Backlog", icone: <ListTodo size={16} /> },
    { valor: "comites", label: "Comitê", icone: <Users size={16} /> },
    { valor: "sprints", label: "Sprints", icone: <CalendarRange size={16} /> },
    { valor: "roadmap", label: "Road Map", icone: <MapIcon size={16} /> },
  ];
  return (
    <div role="tablist" aria-label="Seção" style={{ display: "flex", gap: 4, alignItems: "flex-end", marginBottom: -1, position: "relative", zIndex: 2, flexWrap: "wrap" }}>
      {opcoes.map((o) => {
        const ativo = visao === o.valor;
        return (
          <button
            key={o.valor}
            role="tab"
            aria-selected={ativo}
            onClick={() => setVisao(o.valor)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "Sora,sans-serif",
              fontSize: 14,
              fontWeight: ativo ? 700 : 600,
              padding: ativo ? "11px 20px" : "9px 18px",
              borderRadius: "12px 12px 0 0",
              cursor: "pointer",
              background: ativo ? C.panel : "#ECE9E3",
              color: ativo ? C.text : C.muted,
              border: ativo ? `1px solid ${C.border}` : "1px solid transparent",
              borderTop: ativo ? `3px solid ${C.orange}` : "1px solid transparent",
              borderBottom: ativo ? `1px solid ${C.panel}` : "1px solid transparent",
              transition: "background .15s ease, color .15s ease",
            }}
          >
            <span style={{ display: "flex", color: ativo ? C.orange : C.muted }}>{o.icone}</span>
            {o.label}
          </button>
        );
      })}
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
        <div style={{ width: LARGURA_COLUNA_LABEL, flexShrink: 0, position: "sticky", left: 0, zIndex: 2, background: C.panel }} />
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
        <div
          style={{
            width: LARGURA_COLUNA_LABEL,
            flexShrink: 0,
            borderRight: `1px solid ${C.border}`,
            position: "sticky",
            left: 0,
            zIndex: 2,
            background: C.panel,
          }}
        />
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
    <div style={{ position: "relative", borderTop: `1px solid ${C.border}` }}>
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
        <div
          style={{
            width: LARGURA_COLUNA_LABEL,
            flexShrink: 0,
            padding: "14px 14px 12px",
            borderRight: `1px solid ${C.border}`,
            borderLeft: `5px solid ${cor}`,
            // Coluna "congelada" (pedido por Heder em 2026-09-29, igual coluna fixada no Excel):
            // fica parada na borda esquerda da área com scroll horizontal do Gantt, por cima das
            // barras que passam por baixo dela ao rolar (zIndex + fundo opaco).
            position: "sticky",
            left: 0,
            zIndex: 2,
            background: C.panel,
          }}
        >
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
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  background: C.panel,
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
type CampoAgrupamento = "nenhum" | "areaPath" | "responsavel" | "tipo";

/** Chave/rótulo de agrupamento de uma Task/Bug pelo campo escolhido (pedido por Heder em
 * 2026-09-29: Área, Resp. ou Tipo). Chave = valor bruto (pra ordenar/agrupar certo); rótulo = o
 * texto exibido (Área usa só o último segmento do Area Path, igual ao resto da tela). */
function chaveERotuloGrupo(t: TaskAlocada, campo: CampoAgrupamento): { chave: string; rotulo: string } {
  if (campo === "areaPath") {
    const rotulo = t.areaPath.split("\\").pop() || t.areaPath || "—";
    return { chave: t.areaPath || "—", rotulo };
  }
  if (campo === "responsavel") {
    const rotulo = t.responsavel?.nome ?? "Sem responsável";
    return { chave: rotulo, rotulo };
  }
  if (campo === "tipo") return { chave: t.tipo, rotulo: t.tipo };
  return { chave: "", rotulo: "" };
}

function LinhaTarefa({ t }: { t: TaskAlocada }) {
  const prio = infoPrioridade(t.prioridade);
  const status = corDeEstadoDevOps(t.state);
  const tipo = infoTipo(t.tipo);
  return (
    <div
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
}

/** Linha de soma (rodapé da sprint, ou subtotal de um grupo) — sempre arredondada pra inteiro
 * (pedido por Heder em 2026-09-29: a soma de Effort/Completed Work vem com muitas casas decimais
 * do Azure DevOps, e somar várias em ponto flutuante no JS gera artefatos tipo
 * "290314.09000000000003" em vez de um número redondo). */
function LinhaSoma({ rotulo, somaEstimados, somaReal, destaque }: { rotulo: string; somaEstimados: number; somaReal: number; destaque?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COLUNAS_SPRINT,
        padding: "10px 18px",
        borderTop: `1px solid ${C.border}`,
        background: destaque ? C.soft : "transparent",
      }}
    >
      <div />
      <div />
      <div />
      <div />
      <div />
      <div style={{ fontSize: 11, color: C.muted, textAlign: "right", fontWeight: 700, alignSelf: "center" }}>{rotulo}</div>
      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: C.text }}>{Math.round(somaEstimados)}</div>
      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: C.text }}>{Math.round(somaReal)}</div>
    </div>
  );
}

function SprintsAlocadas({
  tarefas,
  agruparPor,
}: {
  tarefas: TaskAlocada[];
  agruparPor: CampoAgrupamento;
}) {
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

        // Sem agrupamento: 1 grupo só, sem rótulo/subtotal (mesmo visual de antes). Com
        // agrupamento: 1 bloco por valor distinto do campo escolhido, ordenado alfabeticamente.
        const grupos =
          agruparPor === "nenhum"
            ? [{ chave: "", rotulo: "", itens }]
            : Object.values(
                itens.reduce<Record<string, { rotulo: string; itens: TaskAlocada[] }>>((acc, t) => {
                  const { chave, rotulo } = chaveERotuloGrupo(t, agruparPor);
                  acc[chave] ??= { rotulo, itens: [] };
                  acc[chave].itens.push(t);
                  return acc;
                }, {})
              ).sort((a, b) => a.rotulo.localeCompare(b.rotulo));

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

                {grupos.map((grupo) => {
                  const somaGrupoEstimados = grupo.itens.reduce((acc, t) => acc + (t.spEstimados ?? 0), 0);
                  const somaGrupoReal = grupo.itens.reduce((acc, t) => acc + (t.spReal ?? 0), 0);
                  return (
                    <div key={grupo.rotulo}>
                      {agruparPor !== "nenhum" && (
                        <div
                          style={{
                            padding: "8px 18px",
                            fontSize: 12,
                            fontWeight: 700,
                            color: C.text,
                            background: C.grid,
                            borderTop: `1px solid ${C.border}`,
                          }}
                        >
                          {grupo.rotulo} <span style={{ color: C.muted, fontWeight: 600 }}>({grupo.itens.length})</span>
                        </div>
                      )}
                      {grupo.itens.map((t) => (
                        <LinhaTarefa key={t.id} t={t} />
                      ))}
                      {agruparPor !== "nenhum" && (
                        <LinhaSoma rotulo="Subtotal" somaEstimados={somaGrupoEstimados} somaReal={somaGrupoReal} />
                      )}
                    </div>
                  );
                })}

                <LinhaSoma rotulo="Soma" somaEstimados={somaEstimados} somaReal={somaReal} destaque />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ponto de status | Título | Cliente | PO | Área | Agging
const COLUNAS_COMITE = "22px minmax(260px, 1fr) 150px 150px 200px 80px";

const CHAVE_ATRASADOS = "atrasados";

/**
 * Aba Comitês (layout redesenhado por Heder em 2026-10-12, a partir de rascunho): PBIs agrupados
 * pela Data de Comitê, cada data numa seção que expande/comprime. Quem tem Data de Comitê ANTERIOR
 * a hoje cai na seção "Atrasados" (que vem primeiro); o dia de hoje em diante vira uma seção por
 * data, em ordem crescente. (O pedido dizia "posterior à data atual", mas pelo rascunho —
 * Atrasados em vermelho, datas futuras em verde — o sentido é anterior; tratado assim.)
 * Cada PBI é uma linha: Título, Cliente, PO, Área (cor registrada em corDeAreaTabela) e Agging
 * (coluna calculada: hoje − Created Date, em dias inteiros).
 */
function DemandasComiteLista({ demandas, hoje }: { demandas: DemandaComite[]; hoje: Date }) {
  const [recolhidas, setRecolhidas] = useState<Record<string, boolean>>({});
  const hojeChave = chaveDia(hoje);

  const secoes = useMemo(() => {
    const atrasados: DemandaComite[] = [];
    const porData = new Map<string, DemandaComite[]>();
    for (const d of demandas) {
      const dia = d.dataComite ? chaveDia(d.dataComite) : "";
      if (!dia || dia < hojeChave) {
        atrasados.push(d);
      } else {
        porData.set(dia, [...(porData.get(dia) ?? []), d]);
      }
    }
    const lista: { chave: string; rotulo: string; itens: DemandaComite[]; atrasado: boolean }[] = [];
    if (atrasados.length) lista.push({ chave: CHAVE_ATRASADOS, rotulo: "Atrasados", itens: atrasados, atrasado: true });
    Array.from(porData.keys())
      .sort()
      .forEach((chave) => lista.push({ chave, rotulo: formatarChaveDia(chave), itens: porData.get(chave)!, atrasado: false }));
    return lista;
  }, [demandas, hojeChave]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {secoes.map((secao) => {
        const aberta = !recolhidas[secao.chave];
        const cor = secao.atrasado ? C.red : C.green;
        return (
          <section key={secao.chave}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: aberta ? 8 : 0 }}>
              <button
                type="button"
                onClick={() => setRecolhidas((r) => ({ ...r, [secao.chave]: aberta }))}
                aria-expanded={aberta}
                title={aberta ? "Comprimir" : "Expandir"}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: `2px solid ${cor}`,
                  background: "#fff",
                  color: cor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <ChevronRight size={18} style={{ transform: aberta ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
              </button>
              <span
                style={{
                  fontFamily: "Sora,sans-serif",
                  fontWeight: 700,
                  fontSize: 17,
                  padding: "4px 26px",
                  borderRadius: 8,
                  border: `2px solid ${cor}`,
                  background: secao.atrasado ? cor : "#fff",
                  color: secao.atrasado ? "#fff" : cor,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {secao.rotulo}
              </span>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
                {secao.itens.length} {secao.itens.length === 1 ? "PBI" : "PBIs"}
              </span>
            </div>

            {aberta && (
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 880 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: COLUNAS_COMITE,
                      gap: 2,
                      padding: "0 0 4px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.muted,
                      textTransform: "uppercase",
                      letterSpacing: 0.3,
                    }}
                  >
                    <div />
                    <div style={{ padding: "0 10px" }}>Título</div>
                    <div style={{ padding: "0 10px" }}>Cliente</div>
                    <div style={{ padding: "0 10px" }}>PO</div>
                    <div style={{ padding: "0 10px" }}>Área</div>
                    <div style={{ padding: "0 10px", textAlign: "right" }}>Agging</div>
                  </div>
                  {secao.itens.map((d) => {
                    const area = corDeAreaTabela(d.areaPath);
                    const agging = d.createdDate ? Math.max(0, diasEntreChaves(chaveDia(d.createdDate), hojeChave)) : null;
                    const celula: React.CSSProperties = { background: C.soft, padding: "9px 10px", fontSize: 12.5, display: "flex", alignItems: "center", minWidth: 0 };
                    return (
                      <div key={d.id} style={{ display: "grid", gridTemplateColumns: COLUNAS_COMITE, gap: 2, marginBottom: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span
                            title={secao.atrasado ? "Atrasado" : "No prazo"}
                            style={{ width: 12, height: 12, borderRadius: "50%", background: secao.atrasado ? C.orangeDark : C.green, border: `2px solid ${secao.atrasado ? C.red : "#1F8449"}` }}
                          />
                        </div>
                        <div style={{ ...celula, color: C.text, fontWeight: 500, borderRadius: "6px 0 0 6px" }}>
                          #{d.id} · {d.titulo}
                        </div>
                        <div style={{ ...celula, color: C.text }}>{d.cliente || "—"}</div>
                        <div style={{ ...celula, color: C.muted, fontStyle: "italic", fontWeight: 600 }}>{d.po || "—"}</div>
                        <div style={{ ...celula, background: area.bg, color: area.fg, fontWeight: 700, fontStyle: "italic" }}>
                          {d.areaPath.split("\\").pop() || d.areaPath}
                        </div>
                        <div
                          style={{ ...celula, justifyContent: "flex-end", color: C.text, fontWeight: 700, fontVariantNumeric: "tabular-nums", borderRadius: "0 6px 6px 0" }}
                          title={d.createdDate ? `Criado em ${formatarChaveDia(chaveDia(d.createdDate))}` : undefined}
                        >
                          {agging ?? "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}


/**
 * Panel "Alocação por sprint" (pedido por Heder em 2026-10-13, a partir de uma planilha de
 * alocação em Excel): grade com UMA LINHA POR RECURSO (Dev ou QA) e UMA COLUNA POR ITERATION
 * (sprint). Cada célula lista o que o recurso tem naquela sprint: PBI pai da Task (título), e
 * embaixo as Tasks/Bugs com id, nome e Effort. A cor do bloco é a cor registrada da Área
 * (`corDeAreaTabela`, mesma da aba Comitês).
 *
 * Decisões confirmadas com o Heder (2026-10-13):
 * - Papel (Dev × QA) vem do Cadastro de devs (Administração; campo "Função"): função contendo "QA"
 *   = linha de QA; qualquer outra, ou nenhuma/dev fora do cadastro = linha de Dev.
 * - Sem as linhas de Ambiente (Dev/Hom/Prod) do Excel nesta versão — esse dado não existe no Azure.
 * - Cabeçalho da coluna = nome da sprint + datas (início–fim) lidas das Iterations do Azure.
 * A planilha original é semanal; aqui cada coluna é uma sprint inteira (2 semanas).
 *
 * Fontes: as Tasks/Bugs já carregadas na aba Sprints (prop `tarefas`, independente do filtro de
 * Sprint/Área da tabela — como o panel "Esforço por sprint"), + títulos dos PBIs pai
 * (POST /api/roadmap/pais, carregado ao abrir), + datas das sprints (/api/roadmap/sprints-datas)
 * + roster de devs (/api/admin/devs). Datas e roster são só complemento: se falharem, o panel
 * continua funcionando sem eles.
 */
const SEM_RESPONSAVEL = "Sem responsável";

function normalizarNomePessoa(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function ehPapelQA(papel: string | null | undefined): boolean {
  return !!papel && /qa/i.test(papel);
}

function PainelAlocacaoPorSprint({
  modo,
  tarefas,
  produto,
  areasDisponiveis,
  pais,
  carregandoPais,
  clientesFiltro,
  slotFiltros,
  slotAcoes,
}: {
  /** "alocacao" = uma linha por recurso (Dev/QA); "demandas" = uma linha por PBI, com suas Tasks. */
  modo: "alocacao" | "demandas";
  tarefas: TaskAlocada[];
  produto: string;
  areasDisponiveis: string[];
  /** PBIs pai (título, estado, cliente) — buscados pela página, compartilhados com as outras telas. */
  pais: Record<number, { titulo: string; tipo: string; estado: string; cliente?: string }>;
  carregandoPais: boolean;
  /** Filtro de cliente da página (vazio = todos). */
  clientesFiltro: string[];
  slotFiltros: HTMLElement | null;
  slotAcoes: HTMLElement | null;
}) {
  const [datas, setDatas] = useState<Record<string, { inicio: string | null; fim: string | null }>>({});
  const [roster, setRoster] = useState<{ nome: string; papel: string | null }[]>([]);
  const [areasFiltro, setAreasFiltro] = useState<string[]>([]);
  const [inicial, setInicial] = useState<string | null>(null);
  const [sprintsFiltro, setSprintsFiltro] = useState<string[]>([]);
  const [funcoesFiltro, setFuncoesFiltro] = useState<string[]>([]);
  const [comprimidos, setComprimidos] = useState<Record<string, boolean>>({});

  // Datas das sprints + roster de devs (papel) — complementos, falha silenciosa.
  useEffect(() => {
    let cancelado = false;
    fetch(`/api/roadmap/sprints-datas?produto=${produto}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (cancelado) return;
        const mapa: Record<string, { inicio: string | null; fim: string | null }> = {};
        for (const sp of (j.sprints ?? []) as { nome: string; inicio: string | null; fim: string | null }[]) {
          mapa[sp.nome] = { inicio: sp.inicio, fim: sp.fim };
        }
        setDatas(mapa);
      })
      .catch(() => {});

    const projetos = produto === "AMBOS" ? ["KMM4", "KMM5"] : [produto];
    Promise.all(
      projetos.map((p) =>
        fetch(`/api/admin/devs?produto=${p}`, { cache: "no-store" })
          .then((res) => res.json())
          .then((j) => (j.devs ?? []) as { nome: string; papel: string | null }[])
          .catch(() => [] as { nome: string; papel: string | null }[])
      )
    ).then((listas) => {
      if (!cancelado) setRoster(listas.flat());
    });
    return () => {
      cancelado = true;
    };
  }, [produto]);

  const tarefasFiltradas = useMemo(
    () =>
      tarefas.filter(
        (t) =>
          (!areasFiltro.length || areasFiltro.includes(t.areaPath)) &&
          (!clientesFiltro.length || clientesFiltro.includes(clienteDaTarefa(t, pais)))
      ),
    [tarefas, areasFiltro, clientesFiltro, pais]
  );

  // Colunas: todas as sprints com Task/Bug (mesmo com filtro de Área, pra grade não "pular").
  const sprintsOrdenadas = useMemo(
    () =>
      Array.from(new Set(tarefas.map((t) => t.sprint))).sort((a, b) => {
        const [amaj, amin] = chaveOrdenacaoSprint(a);
        const [bmaj, bmin] = chaveOrdenacaoSprint(b);
        return amaj !== bmaj ? amaj - bmaj : amin - bmin;
      }),
    [tarefas]
  );

  // Datas de sprint são datas PURAS (ex. "2026-10-05T00:00:00Z") — lê só os 10 primeiros
  // caracteres, sem converter de fuso. "Hoje" é o dia em Brasília.
  const hojeChave = chaveDia(new Date());
  const sprintAtual =
    sprintsOrdenadas.find((sp) => {
      const d = datas[sp];
      return !!d?.inicio && !!d?.fim && d.inicio.slice(0, 10) <= hojeChave && hojeChave <= d.fim.slice(0, 10);
    }) ?? null;
  // Padrão: começa uma sprint antes da atual (como a planilha); sem datas, mostra desde a primeira.
  const inicialPadrao = sprintAtual
    ? sprintsOrdenadas[Math.max(0, sprintsOrdenadas.indexOf(sprintAtual) - 1)]
    : sprintsOrdenadas[0] ?? "";
  const inicialEfetivo = inicial ?? inicialPadrao;
  const idxInicial = Math.max(0, sprintsOrdenadas.indexOf(inicialEfetivo));
  const sprintsDoIntervalo = sprintsOrdenadas.slice(idxInicial);
  const sprintsVisiveis = sprintsFiltro.length
    ? sprintsDoIntervalo.filter((sp) => sprintsFiltro.includes(sp))
    : sprintsDoIntervalo;

  // Linhas: quem tem Task/Bug (já com o filtro de Área) + roster inteiro quando não há filtro de
  // Área (pra mostrar quem está livre). Chave por nome normalizado (displayName do Azure × Cadastro).
  const linhas = useMemo(() => {
    const papelPorNome = new Map<string, string | null>();
    for (const d of roster) {
      const k = normalizarNomePessoa(d.nome);
      if (!papelPorNome.has(k) || (!papelPorNome.get(k) && d.papel)) papelPorNome.set(k, d.papel);
    }
    const porChave = new Map<string, { chave: string; nome: string; qa: boolean }>();
    const adicionar = (nome: string) => {
      const chave = normalizarNomePessoa(nome);
      if (!porChave.has(chave)) porChave.set(chave, { chave, nome, qa: ehPapelQA(papelPorNome.get(chave)) });
    };
    for (const t of tarefasFiltradas) adicionar(t.responsavel?.nome ?? SEM_RESPONSAVEL);
    if (!areasFiltro.length && !clientesFiltro.length) for (const d of roster) adicionar(d.nome);
    const semResp = normalizarNomePessoa(SEM_RESPONSAVEL);
    const ordenar = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");
    // Filtro de Função (Dev/QA): vazio = todas. "Sem responsável" não tem função, então some
    // quando há filtro ativo.
    const todos = Array.from(porChave.values()).filter((l) => {
      if (!funcoesFiltro.length) return true;
      if (l.chave === semResp) return false;
      return funcoesFiltro.includes(l.qa ? "QA" : "Dev");
    });
    return [
      ...todos.filter((l) => !l.qa && l.chave !== semResp).sort(ordenar),
      ...todos.filter((l) => l.qa && l.chave !== semResp).sort(ordenar),
      ...todos.filter((l) => l.chave === semResp),
    ];
  }, [tarefasFiltradas, roster, areasFiltro, clientesFiltro, funcoesFiltro]);

  const celulas = useMemo(() => {
    const mapa = new Map<string, TaskAlocada[]>();
    for (const t of tarefasFiltradas) {
      const k = `${normalizarNomePessoa(t.responsavel?.nome ?? SEM_RESPONSAVEL)}|${t.sprint}`;
      mapa.set(k, [...(mapa.get(k) ?? []), t]);
    }
    return mapa;
  }, [tarefasFiltradas]);

  // Modo "Demandas" (pedido por Heder em 2026-10-15): a linha é o PBI pai e a célula lista as Tasks/Bugs
  // dele naquela sprint. Só entram PBIs com alguma Task nas sprints visíveis; "Sem PBI pai" por último.
  const celulasPbi = useMemo(() => {
    const mapa = new Map<string, TaskAlocada[]>();
    for (const t of tarefasFiltradas) {
      const k = `${chaveDoPbi(t.pbiPaiId)}|${t.sprint}`;
      mapa.set(k, [...(mapa.get(k) ?? []), t].sort((a, b) => a.id - b.id));
    }
    return mapa;
  }, [tarefasFiltradas]);

  const linhasPbi = (() => {
    const ids = new Set<number | null>();
    for (const t of tarefasFiltradas) {
      if (sprintsVisiveis.includes(t.sprint)) ids.add(t.pbiPaiId);
    }
    return Array.from(ids)
      .sort((a, b) => (a === null ? 1 : 0) - (b === null ? 1 : 0) || (a ?? 0) - (b ?? 0))
      .map((pbiId) => ({ chave: chaveDoPbi(pbiId), pbiId }));
  })();

  const linhasAtivas = modo === "demandas" ? linhasPbi : linhas;

  const fmtCurta = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");
  const BORDA = `1px solid ${C.border}`;
  const LARGURA_RECURSO = modo === "demandas" ? 300 : 190;
  const LARGURA_SPRINT = 240;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Filtros e ações desta tela vivem na barra do painel da página (logo abaixo das abas,
          igual nas outras seções): entram lá via portal nos "slots" criados pela página, mas o
          estado continua aqui dentro. */}
      {slotFiltros &&
        createPortal(
          <>
            {modo === "alocacao" && (
              <MultiSelectFiltro
                rotuloTodos="Todas as funções"
                opcoes={["Dev", "QA"]}
                selecionados={funcoesFiltro}
                onChange={setFuncoesFiltro}
              />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>A partir da</span>
              <select className="kmm-input" style={{ width: "auto" }} value={inicialEfetivo} onChange={(e) => setInicial(e.target.value)}>
                {sprintsOrdenadas.map((sp) => (
                  <option key={sp} value={sp}>
                    {sp}
                  </option>
                ))}
              </select>
            </div>
            <MultiSelectFiltro
              rotuloTodos="Todas as sprints"
              opcoes={sprintsDoIntervalo}
              selecionados={sprintsFiltro}
              onChange={setSprintsFiltro}
            />
            {carregandoPais && <span style={{ fontSize: 12, color: C.muted }}>Carregando títulos dos PBIs…</span>}
          </>,
          slotFiltros
        )}
      {slotAcoes &&
        createPortal(
          <>
            <button className="kmm-btn" onClick={() => setComprimidos({})}>
              Expandir todos
            </button>
            <button className="kmm-btn" onClick={() => setComprimidos(Object.fromEntries(linhasAtivas.map((l) => [l.chave, true])))}>
              Comprimir todos
            </button>
          </>,
          slotAcoes
        )}

      <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
        {modo === "demandas"
          ? "PBI × Iteration · Tasks/Bugs de cada demanda em cada sprint (cor = Área)."
          : "Recurso × Iteration · PBI pai e Tasks/Bugs de cada pessoa em cada sprint (cor = Área)."}
      </div>

      {/* Legenda de Áreas = filtro (pedido por Heder em 2026-10-15): clicar numa área liga/desliga
          o filtro; nenhuma marcada = todas as áreas. Substitui o antigo seletor "Todas as áreas". */}
      {areasDisponiveis.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3, marginRight: 2 }}>Áreas</span>
          {areasDisponiveis.map((a) => {
            const ativa = areasFiltro.includes(a);
            const cor = corDeAreaTabela(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={ativa}
                title={ativa ? "Remover do filtro" : "Filtrar por esta área"}
                onClick={() => setAreasFiltro((atual) => (atual.includes(a) ? atual.filter((x) => x !== a) : [...atual, a]))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: ativa ? 700 : 600,
                  padding: "4px 11px",
                  borderRadius: 999,
                  cursor: "pointer",
                  border: `1px solid ${ativa ? cor.bg : C.border}`,
                  background: ativa ? cor.bg : "#fff",
                  color: ativa ? cor.fg : C.text,
                  opacity: areasFiltro.length > 0 && !ativa ? 0.6 : 1,
                  transition: "opacity .15s ease, background .15s ease",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: cor.bg, border: ativa ? `1px solid ${cor.fg}` : "none", display: "inline-block" }} />
                {a.split("\\").pop() || a}
              </button>
            );
          })}
          {areasFiltro.length > 0 && (
            <button
              type="button"
              onClick={() => setAreasFiltro([])}
              style={{ background: "none", border: "none", cursor: "pointer", color: C.orange, fontSize: 12, fontWeight: 700, padding: "4px 6px", fontFamily: "inherit" }}
            >
              Limpar
            </button>
          )}
        </div>
      )}

        {sprintsVisiveis.length === 0 ? (
          <p style={{ color: C.muted }}>Nenhuma Task ou Bug alocada em sprint para exibir.</p>
        ) : (
          <div style={{ overflow: "auto", border: BORDA, borderRadius: 10, minHeight: 440, maxHeight: "calc(100vh - 250px)" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `${LARGURA_RECURSO}px repeat(${sprintsVisiveis.length}, minmax(${LARGURA_SPRINT}px, 1fr))`,
                minWidth: LARGURA_RECURSO + sprintsVisiveis.length * LARGURA_SPRINT,
              }}
            >
              <div style={{ position: "sticky", top: 0, left: 0, zIndex: 3, background: "#fff", borderBottom: BORDA, borderRight: BORDA, padding: "10px 12px", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>
                {modo === "demandas" ? "PBI" : "Recurso"}
              </div>
              {sprintsVisiveis.map((sp) => {
                const d = datas[sp];
                const atual = sp === sprintAtual;
                return (
                  <div
                    key={sp}
                    style={{ position: "sticky", top: 0, zIndex: 2, background: "#fff", borderBottom: atual ? `3px solid ${C.orange}` : BORDA, borderRight: BORDA, padding: "10px 12px" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 14, color: C.text }}>{sp}</span>
                      {atual && (
                        <span className="kmm-chip" style={{ background: "#FFF1EA", color: C.orange, borderColor: "transparent", padding: "2px 8px", fontSize: 10.5 }}>
                          atual
                        </span>
                      )}
                    </div>
                    {d?.inicio && d?.fim && (
                      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                        {fmtCurta(d.inicio)} – {fmtCurta(d.fim)}
                      </div>
                    )}
                  </div>
                );
              })}

              {modo === "demandas"
                ? linhasPbi.map((linha) => (
                    <PainelDemandaLinha
                      key={linha.chave}
                      linha={linha}
                      sprints={sprintsVisiveis}
                      celulas={celulasPbi}
                      pais={pais}
                      carregandoPais={carregandoPais}
                      borda={BORDA}
                      comprimido={!!comprimidos[linha.chave]}
                      onToggle={() => setComprimidos((prev) => ({ ...prev, [linha.chave]: !prev[linha.chave] }))}
                    />
                  ))
                : linhas.map((linha) => (
                    <PainelAlocacaoLinha
                      key={linha.chave}
                      linha={linha}
                      sprints={sprintsVisiveis}
                      celulas={celulas}
                      pais={pais}
                      carregandoPais={carregandoPais}
                      borda={BORDA}
                      comprimido={!!comprimidos[linha.chave]}
                      onToggle={() => setComprimidos((prev) => ({ ...prev, [linha.chave]: !prev[linha.chave] }))}
                    />
                  ))}
            </div>
          </div>
        )}
    </div>
  );
}

/** Chave estável de uma linha do modo "Demandas" (PBI pai; null = Tasks/Bugs sem PBI pai). */
function chaveDoPbi(pbiId: number | null): string {
  return pbiId == null ? "pbi-sem" : `pbi-${pbiId}`;
}

/**
 * Uma linha (PBI) da grade no modo "Demandas" (pedido por Heder em 2026-10-15): rótulo fixo com o
 * título, estado e cliente do PBI + 1 célula por sprint listando as Tasks/Bugs dele naquela sprint,
 * cada uma num cartão na cor da Área. Comprimido, cada cartão mostra só o título.
 */
function PainelDemandaLinha({
  linha,
  sprints,
  celulas,
  pais,
  carregandoPais,
  borda,
  comprimido,
  onToggle,
}: {
  linha: { chave: string; pbiId: number | null };
  sprints: string[];
  celulas: Map<string, TaskAlocada[]>;
  pais: Record<number, { titulo: string; tipo: string; estado: string; cliente?: string }>;
  carregandoPais: boolean;
  borda: string;
  comprimido: boolean;
  onToggle: () => void;
}) {
  const pai = linha.pbiId != null ? pais[linha.pbiId] : undefined;
  const titulo = linha.pbiId == null ? "Sem PBI pai" : pai ? pai.titulo : carregandoPais ? "…" : "(título indisponível)";
  return (
    <>
      <div
        style={{ position: "sticky", left: 0, zIndex: 1, background: "#fff", borderBottom: borda, borderRight: borda, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, justifyContent: "flex-start" }}
      >
        <button
          onClick={onToggle}
          title={comprimido ? "Expandir" : "Comprimir"}
          style={{ display: "flex", alignItems: "flex-start", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit" }}
        >
          <span style={{ display: "flex", marginTop: 2 }}>
            {comprimido ? <ChevronRight size={14} color={C.muted} /> : <ChevronDown size={14} color={C.muted} />}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
            {linha.pbiId != null && <span style={{ color: C.muted }}>#{linha.pbiId} · </span>}
            {titulo}
          </span>
        </button>
        {(pai?.estado || pai?.cliente) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 18 }}>
            {pai?.estado && (
              <span className="kmm-chip" style={{ padding: "1px 8px", fontSize: 10.5 }}>
                {pai.estado}
              </span>
            )}
            {pai?.cliente && (
              <span className="kmm-chip" style={{ padding: "1px 8px", fontSize: 10.5 }}>
                {pai.cliente}
              </span>
            )}
          </div>
        )}
      </div>
      {sprints.map((sp) => {
        const tasks = celulas.get(`${linha.chave}|${sp}`) ?? [];
        const total = tasks.reduce((acc, t) => acc + (t.spEstimados ?? 0), 0);
        return (
          <div key={sp} style={{ borderBottom: borda, borderRight: borda, padding: 6, minWidth: 0 }}>
            {total > 0 && (
              <div style={{ textAlign: "right", fontSize: 10.5, fontWeight: 700, color: C.faint, padding: "0 2px 3px", fontVariantNumeric: "tabular-nums" }}>
                {total}h
              </div>
            )}
            {tasks.map((t) => {
              const cor = corDeAreaTabela(t.areaPath);
              const rotulo = `${t.tipo === "Bug" ? "Bug " : ""}#${t.id} · ${t.titulo}`;
              const dica = [
                rotulo,
                `Área: ${t.areaPath.split("\\").pop() || t.areaPath}`,
                `Estado: ${t.state}`,
                `Responsável: ${t.responsavel?.nome ?? "sem responsável"}`,
                t.spEstimados != null ? `Effort: ${t.spEstimados}h` : "Sem effort",
              ].join("\n");
              return (
                <div
                  key={t.id}
                  title={dica}
                  style={{ background: cor.bg, color: cor.fg, borderRadius: 6, padding: "6px 8px", marginBottom: 4, fontSize: 11.5, lineHeight: 1.35 }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, display: "-webkit-box", WebkitLineClamp: comprimido ? 1 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {rotulo}
                  </div>
                  {!comprimido && (
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      <span
                        style={{ display: "inline-block", padding: "1px 7px", borderRadius: 999, background: "rgba(255,255,255,.92)", color: C.text, fontSize: 10.5, fontWeight: 700 }}
                      >
                        {t.state}
                      </span>
                      <span style={{ opacity: 0.95, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
                        {t.responsavel?.nome ?? "Sem responsável"}
                      </span>
                      {t.spEstimados != null && <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{t.spEstimados}h</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

/** Uma linha (recurso) da grade do panel "Alocação por sprint": rótulo fixo + 1 célula por sprint. */
function PainelAlocacaoLinha({
  linha,
  sprints,
  celulas,
  pais,
  carregandoPais,
  borda,
  comprimido,
  onToggle,
}: {
  linha: { chave: string; nome: string; qa: boolean };
  sprints: string[];
  celulas: Map<string, TaskAlocada[]>;
  pais: Record<number, { titulo: string; tipo: string; estado: string }>;
  carregandoPais: boolean;
  borda: string;
  comprimido: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <div
        style={{ position: "sticky", left: 0, zIndex: 1, background: "#fff", borderBottom: borda, borderRight: borda, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, justifyContent: "flex-start" }}
      >
        <button
          onClick={onToggle}
          title={comprimido ? "Expandir" : "Comprimir"}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit" }}
        >
          {comprimido ? <ChevronRight size={14} color={C.muted} /> : <ChevronDown size={14} color={C.muted} />}
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{linha.nome}</span>
        </button>
        {linha.chave !== normalizarNomePessoa(SEM_RESPONSAVEL) && (
          <span
            className="kmm-chip"
            style={{ alignSelf: "flex-start", padding: "1px 8px", fontSize: 10.5, background: linha.qa ? "#FCEFD8" : "#E7F0FA", color: linha.qa ? C.amber : C.blue, borderColor: "transparent" }}
          >
            {linha.qa ? "QA" : "Dev"}
          </span>
        )}
      </div>
      {sprints.map((sp) => {
        const tarefasDaCelula = celulas.get(`${linha.chave}|${sp}`) ?? [];
        const total = tarefasDaCelula.reduce((acc, t) => acc + (t.spEstimados ?? 0), 0);

        // Agrupa por Área + PBI pai: um bloco colorido por grupo.
        const grupos = new Map<string, { areaPath: string; pbiPaiId: number | null; itens: TaskAlocada[] }>();
        for (const t of tarefasDaCelula) {
          const k = `${t.areaPath}|${t.pbiPaiId ?? 0}`;
          const g = grupos.get(k) ?? { areaPath: t.areaPath, pbiPaiId: t.pbiPaiId, itens: [] };
          g.itens.push(t);
          grupos.set(k, g);
        }
        const blocos = Array.from(grupos.values()).sort(
          (a, b) => a.areaPath.localeCompare(b.areaPath) || (a.pbiPaiId ?? 0) - (b.pbiPaiId ?? 0)
        );

        return (
          <div key={sp} style={{ borderBottom: borda, borderRight: borda, padding: 6, minWidth: 0 }}>
            {total > 0 && (
              <div style={{ textAlign: "right", fontSize: 10.5, fontWeight: 700, color: C.faint, padding: "0 2px 3px", fontVariantNumeric: "tabular-nums" }}>
                {total}h
              </div>
            )}
            {blocos.map((g) => {
              const cor = corDeAreaTabela(g.areaPath);
              const pai = g.pbiPaiId != null ? pais[g.pbiPaiId] : undefined;
              const rotuloPai =
                g.pbiPaiId == null
                  ? "Sem PBI pai"
                  : pai
                  ? `#${g.pbiPaiId} · ${pai.titulo}`
                  : carregandoPais
                  ? `#${g.pbiPaiId} · …`
                  : `#${g.pbiPaiId}`;
              const dica = [
                `Área: ${g.areaPath.split("\\").pop() || g.areaPath}`,
                `PBI pai: ${rotuloPai}`,
                ...g.itens.map((t) => `${t.tipo === "Bug" ? "Bug" : "Task"} #${t.id} · ${t.titulo} [${t.state}]${t.spEstimados != null ? ` · ${t.spEstimados}h` : ""}`),
              ].join("\n");
              return (
                <div
                  key={`${g.areaPath}|${g.pbiPaiId ?? 0}`}
                  title={dica}
                  style={{ background: cor.bg, color: cor.fg, borderRadius: 6, padding: "6px 8px", marginBottom: 4, fontSize: 11.5, lineHeight: 1.35 }}
                >
                  <div
                    style={{ fontWeight: 700, fontSize: 12, marginBottom: comprimido ? 0 : 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                  >
                    {rotuloPai}
                  </div>
                  {pai?.estado && (
                    <span
                      style={{ display: "inline-block", marginTop: 3, marginBottom: comprimido ? 0 : 3, padding: "1px 7px", borderRadius: 999, background: "rgba(255,255,255,.92)", color: C.text, fontSize: 10.5, fontWeight: 700 }}
                    >
                      {pai.estado}
                    </span>
                  )}
                  {!comprimido && g.itens.map((t) => (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 6, opacity: 0.95 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.tipo === "Bug" ? "Bug " : ""}#{t.id} · {t.titulo}
                      </span>
                      {t.spEstimados != null && <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{t.spEstimados}h</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { X, ChevronDown, Eraser } from "lucide-react";
import { useProduto } from "@/components/ProdutoContext";
import { C } from "@/lib/kmm-theme";
import { mesLabel, classificarEncerramento } from "@/lib/demandas-agregacao";

// Limites de fallback do slider de Data enquanto a 1ª resposta da API não chega (que traz o
// intervalo real via filtros.dataMin/dataMax) — só usados no primeiro render.
const dataMaxPadrao = new Date().toISOString().slice(0, 10);
const dataMinPadrao = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

const axisTick = { fill: C.muted, fontSize: 10, fontFamily: "'Hanken Grotesk',sans-serif" };
const tipStyle = {
  background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 12, boxShadow: "0 6px 18px rgba(0,0,0,.08)",
};

type SerieFluxo = { meses: string[]; abertas: number[]; encerradas: number[]; canceladas: number[] };
type SerieMensal = { meses: string[]; valores: number[] };
type RespostaDemandas = {
  filtros: { clientes: string[]; squads: string[]; dataMin: string | null; dataMax: string | null };
  totais: { abertas: number; encerradas: number; canceladas: number; agingAtual: number; backlogAtual: number };
  fluxoDemandas: SerieFluxo;
  agingViabilidade: SerieMensal;
  backlogViabilidade: SerieMensal;
};

type ItemDetalheAging = {
  workItemId: number;
  produto: string;
  cliente: string | null;
  squad: string | null;
  etapa: string | null;
  descricao: string | null;
  classificacao: string | null;
  dataAberturaProduto: string | null;
  createdDate: string;
  agingDias: number | null;
};

// Formato comum das respostas de /api/demandas/abertas-detalhe e /api/demandas/encerradas-detalhe
// (mesmas colunas de DemandaAtual) — reaproveitado pelos dois modais de detalhe, que têm o mesmo
// layout (pedido por Heder em 2026-09-20: "Demandas Encerradas" replica "Demandas Abertas").
type ItemFluxoDetalhe = {
  workItemId: number;
  produto: string;
  cliente: string | null;
  squad: string | null;
  etapa: string | null;
  descricao: string | null;
  classificacao: string | null;
  state: string;
  createdDate: string;
  closedDate: string | null;
};

const CHIPS_FLUXO = [
  { key: "abertas" as const, label: "Abertas", cor: C.orange },
  { key: "encerradas" as const, label: "Encerradas", cor: C.green },
  { key: "canceladas" as const, label: "Negadas/Canc.", cor: C.red },
];

function Chip({ ativo, cor, label, onClick }: { ativo: boolean; cor: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="kmm-chip"
      style={{
        cursor: "pointer",
        border: `1px solid ${ativo ? cor : C.border}`,
        color: ativo ? cor : C.faint,
        background: ativo ? `${cor}14` : "#fff",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: ativo ? cor : C.faint, display: "inline-block" }} />
      {label}
    </button>
  );
}

function MultiSelectSquad({
  opcoes,
  selecionados,
  onChange,
}: {
  opcoes: string[];
  selecionados: string[];
  onChange: (v: string[]) => void;
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
    selecionados.length === 0 ? "Todos" : selecionados.length === 1 ? selecionados[0] : `${selecionados.length} selecionados`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="kmm-input"
        onClick={() => setAberto((a) => !a)}
        style={{ textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minWidth: 220, cursor: "pointer" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
        <ChevronDown size={14} color={C.muted} style={{ flexShrink: 0 }} />
      </button>
      {aberto && (
        <div
          className="kmm-card"
          style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 260, maxHeight: 280, overflowY: "auto", padding: 8 }}
        >
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}
          >
            <input type="checkbox" checked={selecionados.length === 0} onChange={() => onChange([])} />
            Todos
          </label>
          {opcoes.map((op) => (
            <label key={op} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={selecionados.includes(op)} onChange={() => alternar(op)} />
              {op}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Slider de intervalo (dois cursores) pro filtro de Data, no estilo do slicer "Created Date" do
 * Power BI que Heder mandou de referência (pedido em 2026-09-20). Não existia lib de slider no
 * projeto — implementado com dois "handles" arrastáveis sobre uma trilha, sem dependência nova.
 * `min`/`max` vêm de `filtros.dataMin/dataMax` (limite real dos dados capturados pro produto
 * selecionado — ver app/api/demandas/route.ts); arrastar atualiza só visualmente até soltar o
 * mouse, pra não disparar uma requisição a cada pixel.
 */
function SliderData({
  min,
  max,
  dataInicio,
  dataFim,
  onChange,
}: {
  min: string;
  max: string;
  dataInicio: string;
  dataFim: string;
  onChange: (inicio: string, fim: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const minT = new Date(min).getTime();
  const maxT = new Date(max).getTime();
  const span = Math.max(maxT - minT, 1);

  const loT = dataInicio ? new Date(dataInicio).getTime() : minT;
  const hiT = dataFim ? new Date(dataFim).getTime() : maxT;

  const [arrastando, setArrastando] = useState<"lo" | "hi" | null>(null);
  const [loLocal, setLoLocal] = useState(loT);
  const [hiLocal, setHiLocal] = useState(hiT);
  const loRef = useRef(loT);
  const hiRef = useRef(hiT);

  useEffect(() => {
    if (arrastando) return;
    setLoLocal(loT);
    setHiLocal(hiT);
    loRef.current = loT;
    hiRef.current = hiT;
  }, [loT, hiT, arrastando]);

  function tempoParaData(t: number) {
    return new Date(t).toISOString().slice(0, 10);
  }

  useEffect(() => {
    if (!arrastando) return;

    function pctParaTempo(clientX: number) {
      const rect = trackRef.current!.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return minT + pct * span;
    }

    function mover(e: MouseEvent) {
      const t = pctParaTempo(e.clientX);
      if (arrastando === "lo") {
        const novo = Math.min(t, hiRef.current);
        loRef.current = novo;
        setLoLocal(novo);
      } else {
        const novo = Math.max(t, loRef.current);
        hiRef.current = novo;
        setHiLocal(novo);
      }
    }
    function soltar() {
      setArrastando(null);
      onChange(tempoParaData(loRef.current), tempoParaData(hiRef.current));
    }

    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
    return () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastando, minT, span]);

  const loPct = ((loLocal - minT) / span) * 100;
  const hiPct = ((hiLocal - minT) / span) * 100;

  function handleStyle(pct: number): React.CSSProperties {
    return {
      position: "absolute",
      left: `${pct}%`,
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: 14,
      height: 14,
      borderRadius: "50%",
      background: "#fff",
      border: `2px solid ${C.orange}`,
      cursor: "grab",
      boxShadow: "0 1px 3px rgba(0,0,0,.25)",
    };
  }

  return (
    <div style={{ padding: "12px 10px 4px" }}>
      <div ref={trackRef} style={{ position: "relative", height: 4, background: C.border, borderRadius: 2 }}>
        <div
          style={{
            position: "absolute", left: `${loPct}%`, right: `${100 - hiPct}%`, top: 0, bottom: 0,
            background: C.orange, borderRadius: 2,
          }}
        />
        <div onMouseDown={(e) => { e.preventDefault(); setArrastando("lo"); }} style={handleStyle(loPct)} />
        <div onMouseDown={(e) => { e.preventDefault(); setArrastando("hi"); }} style={handleStyle(hiPct)} />
      </div>
    </div>
  );
}

// Altura fixa dos 3 painéis (Fluxo de Demandas / Agging / Backlog de Viabilidade) — pedido por
// Heder em 2026-09-20. Cada card usa flex column com o gráfico em flex:1, então a altura extra
// (ex.: linha de botão) é absorvida encolhendo só o gráfico, não o card inteiro.
const ALTURA_PAINEL = 490;

type ColunaDetalhe = {
  chave: string;
  label: string;
  /** Texto usado tanto pra exibir (quando não há `render`) quanto pro filtro por coluna. */
  valor: (item: ItemFluxoDetalhe) => string;
  /** Valor usado só pra ordenação, quando precisa ser diferente do texto exibido (ex.: data ISO
   * em vez de "dd/mm/aaaa", pra ordenar corretamente). Default: usa `valor`. */
  ordenar?: (item: ItemFluxoDetalhe) => string | number;
  /** Célula customizada (ex.: badge de cancelada). Default: mostra `valor(item)` como texto. */
  render?: (item: ItemFluxoDetalhe) => React.ReactNode;
};

function celulaDescricao(item: ItemFluxoDetalhe) {
  return (
    <span
      title={item.descricao ?? ""}
      style={{ display: "inline-block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >
      {item.descricao ?? "—"}
    </span>
  );
}

function celulaStatus(item: ItemFluxoDetalhe) {
  return (
    <>
      {item.state}
      {classificarEncerramento(item.state) === "cancelada" && (
        <span style={{ marginLeft: 6, fontSize: 11, color: C.red, fontWeight: 700 }}>CANCELADA</span>
      )}
    </>
  );
}

const COLUNAS_ABERTAS: ColunaDetalhe[] = [
  { chave: "item", label: "Item", valor: (i) => `#${i.workItemId}`, ordenar: (i) => i.workItemId },
  { chave: "descricao", label: "Descrição", valor: (i) => i.descricao ?? "", render: celulaDescricao },
  { chave: "produto", label: "Produto", valor: (i) => i.produto },
  { chave: "cliente", label: "Cliente", valor: (i) => i.cliente ?? "", render: (i) => i.cliente ?? "—" },
  { chave: "squad", label: "Squad", valor: (i) => i.squad ?? "", render: (i) => i.squad ?? "—" },
  { chave: "status", label: "Status", valor: (i) => i.state, render: celulaStatus },
  { chave: "criadoEm", label: "Criado em", valor: (i) => new Date(i.createdDate).toLocaleDateString("pt-BR"), ordenar: (i) => i.createdDate },
];

const COLUNAS_ENCERRADAS: ColunaDetalhe[] = [
  { chave: "item", label: "Item", valor: (i) => `#${i.workItemId}`, ordenar: (i) => i.workItemId },
  { chave: "descricao", label: "Descrição", valor: (i) => i.descricao ?? "", render: celulaDescricao },
  { chave: "produto", label: "Produto", valor: (i) => i.produto },
  { chave: "cliente", label: "Cliente", valor: (i) => i.cliente ?? "", render: (i) => i.cliente ?? "—" },
  { chave: "squad", label: "Squad", valor: (i) => i.squad ?? "", render: (i) => i.squad ?? "—" },
  { chave: "status", label: "Status", valor: (i) => i.state, render: celulaStatus },
  {
    chave: "encerradoEm",
    label: "Encerrado em",
    valor: (i) => (i.closedDate ? new Date(i.closedDate).toLocaleDateString("pt-BR") : "—"),
    ordenar: (i) => i.closedDate ?? "",
  },
];

/**
 * Modal genérico de detalhe (item a item) usado pelos botões "Demandas Abertas" e "Demandas
 * Encerradas" do painel Fluxo de Demandas — mesmo layout pros dois, só mudam as colunas/dados.
 * Pedido por Heder em 2026-09-20: modal em largura total da tela, filtro por coluna e ordenação
 * padrão por data (`ordenarPadrao`). Filtro é substring case-insensitive sobre o texto de cada
 * coluna (`col.valor`); ordenação usa `col.ordenar` (ou `col.valor` se não tiver), decrescente
 * (mais recente/maior primeiro) — inverter é só trocar o sinal do comparador abaixo.
 */
function ModalDetalheDemandas({
  aberto,
  onClose,
  titulo,
  subtitulo,
  colunas,
  itens,
  carregando,
  ordenarPadrao,
  mensagemVazio,
}: {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  subtitulo: string;
  colunas: ColunaDetalhe[];
  itens: ItemFluxoDetalhe[];
  carregando: boolean;
  ordenarPadrao: string;
  mensagemVazio: string;
}) {
  const [filtros, setFiltros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (aberto) setFiltros({});
  }, [aberto]);

  const itensFiltrados = useMemo(() => {
    const filtrados = itens.filter((item) =>
      colunas.every((col) => {
        const f = filtros[col.chave];
        if (!f) return true;
        return col.valor(item).toLowerCase().includes(f.toLowerCase());
      })
    );
    const colOrdenar = colunas.find((c) => c.chave === ordenarPadrao);
    if (!colOrdenar) return filtrados;
    const obterOrdenar = colOrdenar.ordenar ?? colOrdenar.valor;
    return [...filtrados].sort((a, b) => {
      const va = obterOrdenar(a);
      const vb = obterOrdenar(b);
      if (va === vb) return 0;
      return va < vb ? 1 : -1;
    });
  }, [itens, filtros, colunas, ordenarPadrao]);

  if (!aberto) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(20,16,12,.45)", zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="kmm-card"
        style={{ width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontFamily: "Sora,sans-serif", fontSize: 17, color: C.text }}>{titulo}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{subtitulo}</div>
          </div>
          <button onClick={onClose} className="kmm-btn" style={{ padding: 7 }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ overflowY: "auto", marginTop: 10 }}>
          {carregando ? (
            <p style={{ color: C.muted }}>Carregando…</p>
          ) : itens.length === 0 ? (
            <p style={{ color: C.muted }}>{mensagemVazio}</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                  {colunas.map((col) => (
                    <th key={col.chave} style={{ padding: "8px 10px", fontSize: 12, color: C.muted, fontWeight: 600 }}>{col.label}</th>
                  ))}
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {colunas.map((col) => (
                    <th key={col.chave} style={{ padding: "0 10px 8px", fontWeight: 400 }}>
                      <input
                        className="kmm-input"
                        style={{ width: "100%", fontSize: 12, padding: "4px 6px" }}
                        placeholder="Filtrar…"
                        value={filtros[col.chave] ?? ""}
                        onChange={(e) => setFiltros((f) => ({ ...f, [col.chave]: e.target.value }))}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itensFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={colunas.length} style={{ padding: "14px 10px", color: C.muted }}>
                      Nenhum item bate com os filtros da tabela.
                    </td>
                  </tr>
                ) : (
                  itensFiltrados.map((item) => (
                    <tr key={item.workItemId} style={{ borderBottom: `1px solid ${C.border}` }}>
                      {colunas.map((col) => (
                        <td key={col.chave} style={{ padding: "8px 10px" }}>
                          {col.render ? col.render(item) : col.valor(item)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PainelIndicadoresAutomaticoPage() {
  const { produto } = useProduto();
  const [dados, setDados] = useState<RespostaDemandas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [cliente, setCliente] = useState("");
  const [squads, setSquads] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [visiveis, setVisiveis] = useState({ abertas: true, encerradas: true, canceladas: true });
  const [agregarFechamento, setAgregarFechamento] = useState(false);
  const [detalheAgingAberto, setDetalheAgingAberto] = useState(false);
  const [detalheAgingItens, setDetalheAgingItens] = useState<ItemDetalheAging[]>([]);
  const [carregandoDetalheAging, setCarregandoDetalheAging] = useState(false);
  const [abertasAberto, setAbertasAberto] = useState(false);
  const [abertasItens, setAbertasItens] = useState<ItemFluxoDetalhe[]>([]);
  const [carregandoAbertas, setCarregandoAbertas] = useState(false);
  const [encerradasAberto, setEncerradasAberto] = useState(false);
  const [encerradasItens, setEncerradasItens] = useState<ItemFluxoDetalhe[]>([]);
  const [carregandoEncerradas, setCarregandoEncerradas] = useState(false);
  const [salvandoFiltros, setSalvandoFiltros] = useState(false);
  const [dataColapsada, setDataColapsada] = useState(false);
  const [mensagemFiltro, setMensagemFiltro] = useState<string | null>(null);

  // Carrega o setup de filtros salvo (uma vez, ao abrir a tela) e aplica como ponto de partida.
  useEffect(() => {
    fetch("/api/demandas/filtro", { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (j.cliente) setCliente(j.cliente);
        if (Array.isArray(j.squads) && j.squads.length) setSquads(j.squads);
        if (j.dataInicio) setDataInicio(j.dataInicio);
        if (j.dataFim) setDataFim(j.dataFim);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCarregando(true);
    const params = new URLSearchParams();
    params.set("produto", produto);
    if (cliente) params.set("cliente", cliente);
    squads.forEach((s) => params.append("squad", s));
    if (dataInicio) params.set("dataInicio", dataInicio);
    if (dataFim) params.set("dataFim", dataFim);

    fetch(`/api/demandas?${params.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then(setDados)
      .finally(() => setCarregando(false));
  }, [produto, cliente, squads, dataInicio, dataFim]);

  const dadosFluxo = useMemo(() => {
    if (!dados) return [];
    const { meses, abertas, encerradas, canceladas } = dados.fluxoDemandas;
    return meses.map((m, i) => ({
      t: mesLabel(m),
      abertas: abertas[i],
      encerradas: encerradas[i],
      canceladas: canceladas[i],
      encerradasCanceladas: encerradas[i] + canceladas[i],
    }));
  }, [dados]);

  const dadosAging = useMemo(
    () => dados?.agingViabilidade.meses.map((m, i) => ({ t: mesLabel(m), v: dados.agingViabilidade.valores[i] })) ?? [],
    [dados]
  );
  const dadosBacklog = useMemo(
    () => dados?.backlogViabilidade.meses.map((m, i) => ({ t: mesLabel(m), v: dados.backlogViabilidade.valores[i] })) ?? [],
    [dados]
  );

  function limparFiltros() {
    setCliente("");
    setSquads([]);
    setDataInicio("");
    setDataFim("");
  }

  async function salvarFiltros() {
    setSalvandoFiltros(true);
    setMensagemFiltro(null);
    try {
      const res = await fetch("/api/demandas/filtro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente, squads, dataInicio, dataFim }),
      });
      setMensagemFiltro(res.ok ? "Filtros salvos — vão ser o padrão da tela pro time." : "Não foi possível salvar os filtros.");
    } catch {
      setMensagemFiltro("Não foi possível salvar os filtros.");
    } finally {
      setSalvandoFiltros(false);
      setTimeout(() => setMensagemFiltro(null), 4000);
    }
  }

  function abrirDetalheAging() {
    setDetalheAgingAberto(true);
    setCarregandoDetalheAging(true);
    const params = new URLSearchParams();
    params.set("produto", produto);
    if (cliente) params.set("cliente", cliente);
    squads.forEach((s) => params.append("squad", s));
    if (dataInicio) params.set("dataInicio", dataInicio);
    if (dataFim) params.set("dataFim", dataFim);

    fetch(`/api/demandas/aging-detalhe?${params.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setDetalheAgingItens(j.itens ?? []))
      .finally(() => setCarregandoDetalheAging(false));
  }

  // Mês alvo do botão "Demandas Abertas": o mesmo último mês que o KPI "ABERTAS" do painel Fluxo
  // de Demandas está mostrando (ver app/api/demandas/route.ts — totais.abertas = último índice da
  // série). Pedido por Heder em 2026-09-20.
  function abrirDetalheAbertas() {
    const meses = dados?.fluxoDemandas.meses ?? [];
    const mes = meses[meses.length - 1];
    if (!mes) return;
    setAbertasAberto(true);
    setCarregandoAbertas(true);
    const params = new URLSearchParams();
    params.set("produto", produto);
    params.set("mes", mes);
    if (cliente) params.set("cliente", cliente);
    squads.forEach((s) => params.append("squad", s));
    if (dataInicio) params.set("dataInicio", dataInicio);
    if (dataFim) params.set("dataFim", dataFim);

    fetch(`/api/demandas/abertas-detalhe?${params.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setAbertasItens(j.itens ?? []))
      .finally(() => setCarregandoAbertas(false));
  }

  // Mesmo mês-alvo do "Demandas Abertas", mas por Closed Date (o que "ENCERRADAS" usa) — pedido
  // por Heder em 2026-09-20: mesmo layout/detalhamento do botão "Demandas Abertas".
  function abrirDetalheEncerradas() {
    const meses = dados?.fluxoDemandas.meses ?? [];
    const mes = meses[meses.length - 1];
    if (!mes) return;
    setEncerradasAberto(true);
    setCarregandoEncerradas(true);
    const params = new URLSearchParams();
    params.set("produto", produto);
    params.set("mes", mes);
    if (cliente) params.set("cliente", cliente);
    squads.forEach((s) => params.append("squad", s));
    if (dataInicio) params.set("dataInicio", dataInicio);
    if (dataFim) params.set("dataFim", dataFim);

    fetch(`/api/demandas/encerradas-detalhe?${params.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setEncerradasItens(j.itens ?? []))
      .finally(() => setCarregandoEncerradas(false));
  }

  return (
    <div>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>Painel de indicadores</h1>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 20 }}>
        Fluxo, aging e backlog de viabilidade de {produto === "AMBOS" ? "KMM4 e KMM5" : produto}, a partir da captura diária do Azure DevOps.
      </p>

      {/* Barra de Data + barra de Cliente/Squad lado a lado, alinhadas horizontalmente (pedido
          por Heder em 2026-09-20 — antes ficavam empilhadas verticalmente). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start", marginBottom: 20 }}>
        <div className="kmm-card" style={{ maxWidth: 380 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: ".04em" }}>CREATED DATE</span>
            <div style={{ display: "flex", gap: 4 }}>
              {(dataInicio || dataFim) && (
                <button
                  className="kmm-btn"
                  style={{ padding: 6 }}
                  title="Limpar período"
                  onClick={() => { setDataInicio(""); setDataFim(""); }}
                >
                  <Eraser size={13} />
                </button>
              )}
              <button
                className="kmm-btn"
                style={{ padding: 6 }}
                title={dataColapsada ? "Expandir" : "Recolher"}
                onClick={() => setDataColapsada((v) => !v)}
              >
                <ChevronDown size={13} style={{ transform: dataColapsada ? "rotate(-90deg)" : "none", transition: "transform .15s" }} />
              </button>
            </div>
          </div>

          {!dataColapsada && (
            <>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input type="date" className="kmm-input" style={{ flex: 1 }} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                <input type="date" className="kmm-input" style={{ flex: 1 }} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <SliderData
                min={dados?.filtros.dataMin ?? dataMinPadrao}
                max={dados?.filtros.dataMax ?? dataMaxPadrao}
                dataInicio={dataInicio}
                dataFim={dataFim}
                onChange={(inicio, fim) => { setDataInicio(inicio); setDataFim(fim); }}
              />
            </>
          )}
        </div>

        <div className="kmm-card" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Cliente</div>
            <select className="kmm-input" value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Todos</option>
              {dados?.filtros.clientes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Squad</div>
            <MultiSelectSquad opcoes={dados?.filtros.squads ?? []} selecionados={squads} onChange={setSquads} />
          </div>
          <button className="kmm-btn" onClick={salvarFiltros} disabled={salvandoFiltros}>
            {salvandoFiltros ? "Salvando…" : "Salvar Filtros"}
          </button>
          {(cliente || squads.length > 0 || dataInicio || dataFim) && (
            <button className="kmm-btn" onClick={limparFiltros}>Limpar filtros</button>
          )}
          {mensagemFiltro && (
            <span style={{ fontSize: 12.5, color: C.green, alignSelf: "center" }}>{mensagemFiltro}</span>
          )}
        </div>
      </div>

      {carregando ? (
        <p style={{ color: C.muted }}>Carregando indicadores…</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 20, alignItems: "start" }}>
          <div className="kmm-card" style={{ height: ALTURA_PAINEL, display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Sora,sans-serif", fontSize: 17, color: C.text, marginBottom: 2 }}>Fluxo de demandas</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>Abertas, encerradas e negadas/canceladas por mês.</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 4 }}>
              {CHIPS_FLUXO.filter((c) => c.key !== "canceladas" || !agregarFechamento).map((c) => (
                <Chip
                  key={c.key}
                  ativo={visiveis[c.key]}
                  cor={c.cor}
                  label={c.key === "encerradas" && agregarFechamento ? "Encerradas + Canc." : c.label}
                  onClick={() => setVisiveis((v) => ({ ...v, [c.key]: !v[c.key] }))}
                />
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.muted, marginLeft: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={agregarFechamento} onChange={(e) => setAgregarFechamento(e.target.checked)} />
                Agregar Encerradas + Canceladas
              </label>
            </div>

            <div style={{ display: "flex", gap: 28, margin: "10px 0 6px" }}>
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: ".03em" }}>ABERTAS</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.orange }}>{dados?.totais.abertas ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: ".03em" }}>
                  {agregarFechamento ? "ENCERRADAS + CANC." : "ENCERRADAS"}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.green }}>
                  {agregarFechamento ? (dados?.totais.encerradas ?? 0) + (dados?.totais.canceladas ?? 0) : dados?.totais.encerradas ?? 0}
                </div>
              </div>
              {!agregarFechamento && (
                <div>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: ".03em" }}>NEGADAS/CANC.</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: C.red }}>{dados?.totais.canceladas ?? 0}</div>
                </div>
              )}
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dadosFluxo} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="t" stroke={C.border} tick={axisTick} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis stroke={C.border} tick={axisTick} allowDecimals={false} width={34} />
                  <Tooltip contentStyle={tipStyle} />
                  {visiveis.abertas && (
                    <Line type="monotone" dataKey="abertas" name="Demandas abertas" stroke={C.orange} strokeWidth={2.5} dot={{ fill: C.orange, r: 2.5 }} activeDot={{ r: 5 }} />
                  )}
                  {visiveis.encerradas && !agregarFechamento && (
                    <Line type="monotone" dataKey="encerradas" name="Demandas encerradas" stroke={C.green} strokeWidth={2.5} dot={{ fill: C.green, r: 2.5 }} activeDot={{ r: 5 }} />
                  )}
                  {visiveis.canceladas && !agregarFechamento && (
                    <Line type="monotone" dataKey="canceladas" name="Demandas negadas/canceladas" stroke={C.red} strokeWidth={2.5} dot={{ fill: C.red, r: 2.5 }} activeDot={{ r: 5 }} />
                  )}
                  {agregarFechamento && visiveis.encerradas && (
                    <Line type="monotone" dataKey="encerradasCanceladas" name="Encerradas + Canceladas" stroke={C.green} strokeWidth={2.5} dot={{ fill: C.green, r: 2.5 }} activeDot={{ r: 5 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <button className="kmm-btn" onClick={abrirDetalheAbertas}>Demandas Abertas</button>
              <button className="kmm-btn" onClick={abrirDetalheEncerradas}>Demandas Encerradas</button>
            </div>
          </div>

            <div className="kmm-card" style={{ height: ALTURA_PAINEL, display: "flex", flexDirection: "column" }}>
              <div>
                <div style={{ fontFamily: "Sora,sans-serif", fontSize: 17, color: C.text, marginBottom: 2 }}>Agging de Viabilidade</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>Idade média das demandas pendentes de análise pelo time.</div>
                {/* Pedido por Heder em 2026-09-20 — mesmo texto replicado em Backlog de Viabilidade. */}
                <div style={{ fontSize: 11.5, color: C.muted, fontStyle: "italic", marginBottom: 10 }}>
                  Obs.: Não está sendo considerado demandas internas KMM.
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: ".03em" }}>ATUAL</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                {dados?.totais.agingAtual ?? 0} <span style={{ fontSize: 14, fontWeight: 500, color: C.muted }}>dias</span>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dadosAging} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="t" stroke={C.border} tick={axisTick} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis stroke={C.border} tick={axisTick} allowDecimals={false} width={34} />
                    <Tooltip contentStyle={tipStyle} />
                    <Line type="monotone" dataKey="v" name="Aging médio (dias)" stroke={C.orange} strokeWidth={2.5} dot={{ fill: C.orange, r: 2.5 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Botão "Detalhes" movido do topo (ao lado do título) pra base do painel — pedido por
                  Heder em 2026-09-20. */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button className="kmm-btn" onClick={abrirDetalheAging}>Detalhes</button>
              </div>
            </div>

            <div className="kmm-card" style={{ height: ALTURA_PAINEL, display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: "Sora,sans-serif", fontSize: 17, color: C.text, marginBottom: 2 }}>Backlog de Viabilidade</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>Demandas aguardando análise de viabilidade (último snapshot do mês).</div>
              {/* Pedido por Heder em 2026-09-20 — mesmo texto replicado de Agging de Viabilidade. */}
              <div style={{ fontSize: 11.5, color: C.muted, fontStyle: "italic", marginBottom: 10 }}>
                Obs.: Não está sendo considerado demandas internas KMM.
              </div>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: ".03em" }}>ATUAL</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                {dados?.totais.backlogAtual ?? 0} <span style={{ fontSize: 14, fontWeight: 500, color: C.muted }}>demandas</span>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosBacklog} margin={{ top: 22, right: 10, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="t" stroke={C.border} tick={axisTick} interval="preserveStartEnd" minTickGap={14} />
                    <YAxis stroke={C.border} tick={axisTick} allowDecimals={false} width={34} />
                    <Tooltip contentStyle={tipStyle} cursor={{ fill: "rgba(0,0,0,.03)" }} />
                    <Bar dataKey="v" name="Backlog" fill={C.orange} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {detalheAgingAberto && (
        <div
          onClick={() => setDetalheAgingAberto(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(20,16,12,.45)", zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="kmm-card"
            style={{ width: "min(760px, 100%)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
              <div>
                <div style={{ fontFamily: "Sora,sans-serif", fontSize: 17, color: C.text }}>Detalhes — Agging de Viabilidade</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                  Itens em State = "Backlog" no snapshot mais recente, que compõem o valor "ATUAL" mostrado no painel.
                </div>
              </div>
              <button onClick={() => setDetalheAgingAberto(false)} className="kmm-btn" style={{ padding: 7 }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ overflowY: "auto", marginTop: 10 }}>
              {carregandoDetalheAging ? (
                <p style={{ color: C.muted }}>Carregando…</p>
              ) : detalheAgingItens.length === 0 ? (
                <p style={{ color: C.muted }}>Nenhum item de backlog para os filtros selecionados.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                      {["Item", "Descrição", "Produto", "Cliente", "Squad", "Etapa", "Classificação", "Aging"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", fontSize: 12, color: C.muted, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detalheAgingItens.map((item) => (
                      <tr key={item.workItemId} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "8px 10px" }}>#{item.workItemId}</td>
                        <td style={{ padding: "8px 10px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.descricao ?? ""}>{item.descricao ?? "—"}</td>
                        <td style={{ padding: "8px 10px", color: C.orange, fontWeight: 600 }}>{item.produto}</td>
                        <td style={{ padding: "8px 10px" }}>{item.cliente ?? "—"}</td>
                        <td style={{ padding: "8px 10px" }}>{item.squad ?? "—"}</td>
                        <td style={{ padding: "8px 10px" }}>{item.etapa ?? "—"}</td>
                        <td style={{ padding: "8px 10px" }}>{item.classificacao ?? "—"}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>{item.agingDias ?? "—"}{item.agingDias != null ? " dias" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <ModalDetalheDemandas
        aberto={abertasAberto}
        onClose={() => setAbertasAberto(false)}
        titulo={`Demandas Abertas${dados?.fluxoDemandas.meses.length ? ` — ${mesLabel(dados.fluxoDemandas.meses[dados.fluxoDemandas.meses.length - 1])}` : ""}`}
        subtitulo={'Itens que compõem o número "ABERTAS" do painel Fluxo de Demandas, por mês de Created Date — inclui itens cancelados depois de abertos (RN02.10: cancelar não desfaz a abertura).'}
        colunas={COLUNAS_ABERTAS}
        itens={abertasItens}
        carregando={carregandoAbertas}
        ordenarPadrao="criadoEm"
        mensagemVazio="Nenhum item aberto nesse mês para os filtros selecionados."
      />

      <ModalDetalheDemandas
        aberto={encerradasAberto}
        onClose={() => setEncerradasAberto(false)}
        titulo={`Demandas Encerradas${dados?.fluxoDemandas.meses.length ? ` — ${mesLabel(dados.fluxoDemandas.meses[dados.fluxoDemandas.meses.length - 1])}` : ""}`}
        subtitulo={'Itens que compõem o número "ENCERRADAS" do painel Fluxo de Demandas, por mês de Closed Date (não inclui canceladas, que têm o número "NEGADAS/CANC." separado).'}
        colunas={COLUNAS_ENCERRADAS}
        itens={encerradasItens}
        carregando={carregandoEncerradas}
        ordenarPadrao="encerradoEm"
        mensagemVazio="Nenhum item encerrado nesse mês para os filtros selecionados."
      />
    </div>
  );
}

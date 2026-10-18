"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, X } from "lucide-react";
import { C } from "@/lib/kmm-theme";
import { nomeCurtoDaSquad } from "@/lib/backlog";
import { formatarChaveDia } from "@/lib/datas";
import { agingDiasPbi, emBacklogDemanda, norm, type IndicadoresGestao, type PbiGestaoCliente, type UltimoComentario } from "@/lib/gestao-clientes";

const ORG_DEVOPS = "kmmbynstech";

/**
 * Blocos da Gestão de clientes (pedidos do Heder, 2026-10-17/18). Todos recebem os PBIs JÁ filtrados
 * (cliente/squad) e as tabelas rolam DENTRO do próprio quadro (altura limitada, cabeçalho fixo e
 * barras sempre visíveis) — a página não vira uma lista gigante com a rolagem lá no fim.
 *
 * - LinhaBacklogIndicadores (linha 1): "Demandas em backlog" (State = Backlog nas etapas Backlog,
 *   Análise ou Comitê — mesma regra do indicador; Agging aberto = agingDiasPbi, a mesma regra do
 *   indicador de Agging de Viabilidade) + coluna com 3 indicadores. O "Demandas c/comercial" tem um
 *   ícone discreto que abre o painel com os PBIs em State = Orçamento (e o total do Effort).
 * - LinhaExecucao (linha 2): gráfico de barras dos PBIs em State = Execução por Etapa + tabela
 *   "Demandas em execução" (com a Observação = último comentário, que chega depois da tabela).
 */

export function DivisorSecao({ titulo }: { titulo: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "36px 0 18px" }}>
      <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.text, margin: 0, whiteSpace: "nowrap" }}>
        {titulo}
      </h2>
      <div style={{ flex: 1, height: 2, background: C.border, borderRadius: 2 }} />
    </div>
  );
}

/** Cartão de indicador (título pequeno em maiúsculas, valor grande, nota) com ação discreta opcional. */
export function IndicadorCard({
  titulo,
  valor,
  unidade,
  nota,
  acao,
}: {
  titulo: string;
  valor: string;
  unidade?: string;
  nota?: string;
  /** Ícone/botão discreto no canto do cartão (ex.: abrir um painel de detalhe). */
  acao?: { rotulo: string; onClick: () => void };
}) {
  return (
    <div className="kmm-card" style={{ position: "relative" }}>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: ".04em", paddingRight: acao ? 24 : 0 }}>{titulo}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: C.text, marginTop: 6 }}>
        {valor}
        {unidade && valor !== "—" && valor !== "…" && <span style={{ fontSize: 14, fontWeight: 500, color: C.muted }}> {unidade}</span>}
      </div>
      {nota && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>{nota}</div>}
      {acao && (
        <button
          type="button"
          onClick={acao.onClick}
          title={acao.rotulo}
          aria-label={acao.rotulo}
          style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", padding: 4, color: C.faint, display: "flex", borderRadius: 6 }}
        >
          <ExternalLink size={15} />
        </button>
      )}
    </div>
  );
}

export function LinhaBacklogIndicadores({
  itens,
  indicadores,
  carregando,
}: {
  itens: PbiGestaoCliente[];
  indicadores: IndicadoresGestao;
  carregando: boolean;
}) {
  const [orcamentoAberto, setOrcamentoAberto] = useState(false);
  const backlog = itens.filter(emBacklogDemanda);
  const orcamento = itens.filter((p) => norm(p.state) === "orcamento");
  const agora = Date.now();
  const valor = (v: number | null) => (carregando ? "…" : v == null ? "—" : String(v));

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(260px, 1fr)", gap: 16, alignItems: "start" }}>
        <Quadro titulo="Demandas em backlog" contagem={carregando ? null : backlog.length}>
          <Tabela
            colunas={["Chamado", "Tarefa", "PBI", "Esteira", "PO", "Data abertura produto", "Etapa", "Data comitê", "Agging aberto"]}
            vazio={carregando ? "Carregando…" : "Nenhuma demanda em backlog para os filtros atuais."}
            linhas={backlog.map((p) => {
              const aging = agingDiasPbi(p, agora);
              return [
                { k: "chamado", v: p.idExterno || "—", nowrap: true },
                { k: "tarefa", v: p.titulo, largo: true },
                { k: "pbi", v: <LinkPbi p={p} />, nowrap: true },
                { k: "esteira", v: nomeCurtoDaSquad(p.areaPath) || "—", nowrap: true },
                { k: "po", v: p.po || "—", largo: true, minW: 150 },
                { k: "abertura", v: dataCurta(p.dataAberturaProduto), nowrap: true, num: true },
                { k: "etapa", v: p.etapa || "—", nowrap: true },
                { k: "comite", v: dataCurta(p.dataComite), nowrap: true, num: true },
                { k: "aging", v: aging == null ? "—" : `${aging} d`, nowrap: true, num: true, forte: true },
              ];
            })}
            chaves={backlog.map((p) => p.id)}
            minWidth={1100}
          />
        </Quadro>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <IndicadorCard titulo="DEMANDAS EM BACKLOG" valor={valor(indicadores.demandasBacklog)} nota="Backlog nas etapas Backlog, Análise ou Comitê" />
          <IndicadorCard
            titulo="AGGING DE VIABILIDADE"
            valor={valor(indicadores.agingViabilidadeDias)}
            unidade="dias"
            nota="Idade média dos itens em Backlog (sem KMM INTERNO)"
          />
          <IndicadorCard
            titulo="DEMANDAS C/COMERCIAL"
            valor={valor(indicadores.demandasEtapaComercial)}
            nota="Orçamento + Backlog na etapa Relacionamento Comercial"
            acao={{ rotulo: "Ver demandas em orçamento", onClick: () => setOrcamentoAberto(true) }}
          />
        </div>
      </div>

      {orcamentoAberto && <PainelOrcamento orcamento={orcamento} onFechar={() => setOrcamentoAberto(false)} />}
    </>
  );
}

/** Painel (modal) com os PBIs em State = Orçamento e o total do Effort — aberto pelo ícone do indicador "Demandas c/comercial". */
function PainelOrcamento({ orcamento, onFechar }: { orcamento: PbiGestaoCliente[]; onFechar: () => void }) {
  const totalEffort = orcamento.reduce((acc, p) => acc + (p.effort ?? 0), 0);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div
      onClick={onFechar}
      style={{ position: "fixed", inset: 0, background: "rgba(22,19,15,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Demandas em orçamento" className="kmm-card" style={{ width: "100%", maxWidth: 780, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px 12px" }}>
          <div>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 16, color: C.text }}>Demandas em orçamento</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {orcamento.length} {orcamento.length === 1 ? "demanda" : "demandas"} com status Orçamento.
            </div>
          </div>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <Tabela
          colunas={["Chamado", "Tarefa", "PBI", "Data comitê", "Effort"]}
          vazio="Nenhuma demanda em orçamento para os filtros atuais."
          linhas={orcamento.map((p) => [
            { k: "chamado", v: p.idExterno || "—", nowrap: true },
            { k: "tarefa", v: p.titulo, largo: true, minW: 260 },
            { k: "pbi", v: <LinkPbi p={p} />, nowrap: true },
            { k: "comite", v: dataCurta(p.dataComite), nowrap: true, num: true },
            { k: "effort", v: p.effort == null ? "—" : `${formatarNumero(p.effort)} h`, nowrap: true, num: true, forte: true },
          ])}
          chaves={orcamento.map((p) => p.id)}
          minWidth={620}
        />
        <div style={{ padding: "11px 18px", borderTop: `1px solid ${C.border}`, background: C.soft, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Total effort</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{formatarNumero(totalEffort)} h</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Linha 2: gráfico de barras dos PBIs em State = Execução por Etapa (barras horizontais — os nomes
 * das etapas são longos, ex. "Aguardando Priorização") + tabela "Demandas em execução".
 */
export function LinhaExecucao({
  itens,
  comentarios,
  carregando,
}: {
  itens: PbiGestaoCliente[];
  comentarios: Record<number, UltimoComentario | null>;
  carregando: boolean;
}) {
  const execucao = itens.filter((p) => norm(p.state) === "execucao");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)", gap: 16, alignItems: "start" }}>
      <GraficoExecucaoPorEtapa execucao={execucao} carregando={carregando} />

      <Quadro titulo="Demandas em execução" contagem={carregando ? null : execucao.length}>
        <Tabela
          colunas={["Chamado", "PBI", "Título", "Esteira", "PO", "Classificação", "Observação"]}
          vazio={carregando ? "Carregando…" : "Nenhuma demanda em execução para os filtros atuais."}
          linhas={execucao.map((p) => {
            const com = comentarios[p.id];
            const aguardandoComentario = p.qtdComentarios > 0 && com === undefined;
            return [
              { k: "chamado", v: p.idExterno || "—", nowrap: true },
              { k: "pbi", v: <LinkPbi p={p} />, nowrap: true },
              { k: "titulo", v: p.titulo, largo: true, minW: 220 },
              { k: "esteira", v: nomeCurtoDaSquad(p.areaPath) || "—", nowrap: true },
              { k: "po", v: p.po || "—", largo: true, minW: 150 },
              { k: "classificacao", v: p.classificacao || "—", nowrap: true },
              {
                k: "observacao",
                v: aguardandoComentario ? "…" : com?.texto || "—",
                largo: true,
                minW: 280,
                dica: com?.texto ? `${com.autor}${com.data ? " · " + new Date(com.data).toLocaleDateString("pt-BR") : ""}\n${com.texto}` : undefined,
              },
            ];
          })}
          chaves={execucao.map((p) => p.id)}
          minWidth={1150}
        />
      </Quadro>
    </div>
  );
}

function GraficoExecucaoPorEtapa({ execucao, carregando }: { execucao: PbiGestaoCliente[]; carregando: boolean }) {
  const porEtapa = new Map<string, number>();
  for (const p of execucao) {
    const etapa = p.etapa || "Sem etapa";
    porEtapa.set(etapa, (porEtapa.get(etapa) ?? 0) + 1);
  }
  const dados = Array.from(porEtapa, ([etapa, qtd]) => ({ etapa, qtd })).sort((a, b) => b.qtd - a.qtd || a.etapa.localeCompare(b.etapa, "pt-BR"));
  const altura = Math.max(150, dados.length * 40 + 24);

  return (
    <div className="kmm-card" style={{ padding: "14px 16px 12px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 700, fontSize: 15, color: C.text }}>Execução por etapa</div>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>
          {carregando ? "…" : `${execucao.length} ${execucao.length === 1 ? "demanda" : "demandas"}`}
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Distribuição dos PBIs em Execução entre as etapas.</div>
      {dados.length === 0 ? (
        <div style={{ padding: "28px 4px 16px", fontSize: 13, color: C.muted }}>{carregando ? "Carregando…" : "Nenhuma demanda em execução para os filtros atuais."}</div>
      ) : (
        <div style={{ height: altura, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 4 }}>
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis type="category" dataKey="etapa" width={185} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 12, fill: C.text, fontWeight: 600 }} />
              <Tooltip cursor={{ fill: "transparent" }} formatter={(v: number) => [`${v} ${v === 1 ? "demanda" : "demandas"}`, "Execução"]} />
              <Bar dataKey="qtd" radius={[0, 8, 8, 0]} barSize={22} minPointSize={4} isAnimationActive={false}>
                {dados.map((d) => (
                  <Cell key={d.etapa} fill={C.orange} />
                ))}
                <LabelList dataKey="qtd" position="right" style={{ fontSize: 13, fontWeight: 700, fill: C.text }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function dataCurta(iso: string | null): string {
  return iso ? formatarChaveDia(iso.slice(0, 10)) : "—";
}

function formatarNumero(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function LinkPbi({ p }: { p: PbiGestaoCliente }) {
  return (
    <a
      href={`https://dev.azure.com/${ORG_DEVOPS}/${encodeURIComponent(p.projeto)}/_workitems/edit/${p.id}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: C.blue, textDecoration: "none", fontWeight: 600 }}
    >
      {p.id}
    </a>
  );
}

/** Cartão com título + contagem, área de conteúdo e (opcional) rodapé fixo fora da rolagem. */
function Quadro({ titulo, contagem, rodape, children }: { titulo: string; contagem: number | null; rodape?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="kmm-card" style={{ padding: 0, overflow: "hidden", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "14px 16px 12px" }}>
        <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 700, fontSize: 15, color: C.text }}>{titulo}</div>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{contagem == null ? "…" : `${contagem} ${contagem === 1 ? "demanda" : "demandas"}`}</div>
      </div>
      {children}
      {rodape && <div style={{ padding: "11px 16px", borderTop: `1px solid ${C.border}`, background: C.soft }}>{rodape}</div>}
    </div>
  );
}

type Celula = {
  k: string;
  v: React.ReactNode;
  nowrap?: boolean;
  /** Texto longo: limita as linhas (`clamp`, padrão 2) e usa largura mínima (`minW`, ou a da tabela). */
  largo?: boolean;
  clamp?: number;
  minW?: number;
  /** Texto do tooltip (por padrão, o próprio texto da célula). */
  dica?: string;
  num?: boolean;
  forte?: boolean;
};

/** Tabela com rolagem própria (vertical + horizontal visíveis) e cabeçalho fixo. */
function Tabela({
  colunas,
  linhas,
  chaves,
  vazio,
  minWidth,
  larguraTarefa = 200,
}: {
  colunas: string[];
  linhas: Celula[][];
  chaves: number[];
  vazio: string;
  minWidth: number;
  /** Largura mínima da coluna de texto longo ("Tarefa"/"Título"). */
  larguraTarefa?: number;
}) {
  return (
    <div className="kmm-rolagem" style={{ overflow: "auto", maxHeight: "min(560px, calc(100vh - 220px))", minHeight: 160, borderTop: `1px solid ${C.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: linhas.length ? minWidth : undefined }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            {colunas.map((h) => (
              <th key={h} style={{ position: "sticky", top: 0, zIndex: 2, background: C.dark, padding: "10px 12px", fontSize: 12, color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={colunas.length} style={{ padding: 18, color: C.muted, fontSize: 13 }}>
                {vazio}
              </td>
            </tr>
          ) : (
            linhas.map((cels, i) => (
              <tr key={chaves[i]} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 ? "#FAF9F7" : "#fff", fontSize: 12.5, verticalAlign: "top" }}>
                {cels.map((c) => (
                  <td
                    key={c.k}
                    style={{
                      padding: "8px 12px",
                      whiteSpace: c.nowrap ? "nowrap" : "normal",
                      minWidth: c.largo ? (c.minW ?? larguraTarefa) : undefined,
                      textAlign: c.num ? "right" : "left",
                      fontVariantNumeric: c.num ? "tabular-nums" : undefined,
                      fontWeight: c.forte ? 700 : 400,
                      color: C.text,
                    }}
                  >
                    {c.largo ? (
                      <span style={{ display: "-webkit-box", WebkitLineClamp: c.clamp ?? 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={c.dica ?? (typeof c.v === "string" ? c.v : undefined)}>
                        {c.v}
                      </span>
                    ) : (
                      c.v
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

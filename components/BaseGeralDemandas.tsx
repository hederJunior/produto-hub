"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, X } from "lucide-react";
import { BARRA_FORTE, BARRA_SUAVE, C, PASTEL } from "@/lib/kmm-theme";
import { nomeCurtoDaSquad } from "@/lib/backlog";
import { formatarChaveDia } from "@/lib/datas";
import { agingDiasPbi, emBacklogDemanda, norm, type IndicadoresGestao, type PbiGestaoCliente, type UltimoComentario } from "@/lib/gestao-clientes";

const ORG_DEVOPS = "kmmbynstech";

/** Altura padrão dos quadros de tabela da Gestão de clientes (todos iguais, rolando por dentro). */
export const ALTURA_QUADRO = "min(460px, calc(100vh - 280px))";

/**
 * Blocos da Gestão de clientes. Todos recebem os PBIs JÁ filtrados (cliente/squad). Visual suave
 * (2026-10-18): cartões brancos de cantos arredondados, cabeçalho de tabela claro, tipografia leve.
 * As tabelas têm TODAS a mesma altura (ALTURA_QUADRO) e rolam dentro do quadro (cabeçalho fixo,
 * barras sempre visíveis) — a página não vira uma lista gigante com a rolagem lá no fim.
 *
 * - VisaoBacklogOrcamento: gráfico de aging (faixas de dias em backlog) + 3 indicadores numa linha,
 *   ao lado da tabela "Demandas em backlog" (State = Backlog nas etapas Backlog, Análise ou Comitê —
 *   mesma regra do indicador; Agging aberto = agingDiasPbi). O indicador "Demandas c/comercial" tem um
 *   ícone discreto que abre o painel com os PBIs em State = Orçamento (e o total do Effort).
 * - VisaoPorStatus: gráfico por Etapa + tabela dos PBIs de um status (Execução, Teste Aceite Usuário),
 *   com a Observação = último comentário (chega depois da tabela).
 */

export function DivisorSecao({ titulo }: { titulo: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "30px 0 16px" }}>
      <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: ".09em", textTransform: "uppercase", color: "#4A4640", margin: 0, whiteSpace: "nowrap" }}>
        {titulo}
      </h2>
      <div style={{ flex: 1, height: 1, background: "#E8E2DB" }} />
    </div>
  );
}

/** Indicador compacto (pastel + ponto colorido), cabe três numa linha de coluna estreita. */
function IndicadorCompacto({
  cor,
  titulo,
  valor,
  unidade,
  dica,
  acao,
}: {
  cor: keyof typeof PASTEL;
  titulo: string;
  valor: string;
  unidade?: string;
  dica?: string;
  acao?: { rotulo: string; onClick: () => void };
}) {
  return (
    <div title={dica} style={{ position: "relative", flex: 1, minWidth: 0, background: PASTEL[cor].bg, borderRadius: 14, padding: "11px 12px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: "#6F6B66", lineHeight: 1.3, paddingRight: acao ? 16 : 0 }}>
        <i style={{ width: 7, height: 7, borderRadius: "50%", background: PASTEL[cor].dot, flexShrink: 0, marginTop: 4 }} />
        <span>{titulo}</span>
      </div>
      <div style={{ fontFamily: "Sora,sans-serif", fontSize: 24, fontWeight: 600, color: C.text, marginTop: 6 }}>
        {valor}
        {unidade && valor !== "—" && valor !== "…" && <span style={{ fontSize: 12, fontWeight: 400, color: C.muted }}> {unidade}</span>}
      </div>
      {acao && (
        <button
          type="button"
          onClick={acao.onClick}
          title={acao.rotulo}
          aria-label={acao.rotulo}
          style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", cursor: "pointer", padding: 3, color: C.faint, display: "flex", borderRadius: 6 }}
        >
          <ExternalLink size={13} />
        </button>
      )}
    </div>
  );
}

/** Faixas do gráfico de aging (dias desde a Data de abertura do produto); "Sem data" só aparece se houver itens sem data. */
const FAIXAS_AGING: { rotulo: string; contem: (d: number) => boolean }[] = [
  { rotulo: "< 15 dias", contem: (d) => d < 15 },
  { rotulo: "15–30 dias", contem: (d) => d >= 15 && d < 30 },
  { rotulo: "30–45 dias", contem: (d) => d >= 30 && d < 45 },
  { rotulo: "> 45 dias", contem: (d) => d >= 45 },
];

export function VisaoBacklogOrcamento({
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

  const agings = backlog.map((p) => agingDiasPbi(p, agora));
  const dadosAging = FAIXAS_AGING.map((f) => ({ faixa: f.rotulo, qtd: agings.filter((d) => d != null && f.contem(d)).length }));
  const semData = agings.filter((d) => d == null).length;
  if (semData > 0) dadosAging.push({ faixa: "Sem data", qtd: semData });

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", gap: 16, alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="kmm-card" style={{ flex: 1, minHeight: 230, display: "flex", flexDirection: "column", padding: "16px 16px 10px" }}>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 14, color: C.text }}>Demandas por faixa de aging</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Dias em backlog, desde a abertura no produto.</div>
            <div style={{ flex: 1, minHeight: 150, marginTop: 8 }}>
              {carregando ? (
                <div style={{ padding: "24px 4px", fontSize: 13, color: C.muted }}>Carregando…</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosAging} margin={{ top: 22, right: 8, left: 8, bottom: 0 }}>
                    <XAxis dataKey="faixa" tickLine={false} axisLine={{ stroke: "#EEE9E3" }} interval={0} tick={{ fontSize: 11, fill: "#7A7680" }} />
                    <YAxis hide domain={[0, "dataMax + 1"]} />
                    <Tooltip cursor={{ fill: "transparent" }} formatter={(v: number) => [`${v} ${v === 1 ? "demanda" : "demandas"}`, "Backlog"]} />
                    <Bar dataKey="qtd" radius={[8, 8, 0, 0]} maxBarSize={44} minPointSize={3} isAnimationActive={false}>
                      {dadosAging.map((d, i) => (
                        <Cell key={d.faixa} fill={d.faixa === "> 45 dias" || i === dadosAging.length - 1 ? BARRA_FORTE : BARRA_SUAVE} />
                      ))}
                      <LabelList dataKey="qtd" position="top" style={{ fontSize: 12, fontWeight: 600, fill: C.text }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <IndicadorCompacto cor="slate" titulo="Demandas em Backlog" valor={valor(indicadores.demandasBacklog)} dica="Backlog nas etapas Backlog, Análise ou Comitê" />
            <IndicadorCompacto cor="amber" titulo="Agging de viabilidade" valor={valor(indicadores.agingViabilidadeDias)} unidade="dias" dica="Idade média dos itens em Backlog (sem KMM INTERNO)" />
            <IndicadorCompacto
              cor="sky"
              titulo="Demandas c/comercial"
              valor={valor(indicadores.demandasEtapaComercial)}
              dica="Orçamento + Backlog na etapa Relacionamento Comercial"
              acao={{ rotulo: "Ver demandas em orçamento", onClick: () => setOrcamentoAberto(true) }}
            />
          </div>
        </div>

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
      style={{ position: "fixed", inset: 0, background: "rgba(30,27,24,.38)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Demandas em orçamento" className="kmm-card" style={{ width: "100%", maxWidth: 780, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px 12px" }}>
          <div>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 16, color: C.text }}>Demandas em orçamento</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {orcamento.length} {orcamento.length === 1 ? "demanda" : "demandas"} com status Orçamento.
            </div>
          </div>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <Tabela
          altura="min(380px, calc(100vh - 300px))"
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
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Total effort</span>
          <span style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{formatarNumero(totalEffort)} h</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Visão de um status do board (Execução, Teste Aceite Usuário): gráfico de barras dos PBIs naquele
 * status por Etapa (barras horizontais — os nomes das etapas são longos) + tabela dos PBIs, com a
 * Observação = último comentário. Mesma proporção (1 : 2) e mesma altura de quadro da visão Backlog.
 */
export function VisaoPorStatus({
  estado,
  tituloTabela,
  tituloGrafico,
  itens,
  comentarios,
  carregando,
}: {
  /** Nome do status do board (comparado sem acento/maiúsculas), ex. "Execução". */
  estado: string;
  tituloTabela: string;
  tituloGrafico: string;
  itens: PbiGestaoCliente[];
  comentarios: Record<number, UltimoComentario | null>;
  carregando: boolean;
}) {
  const doStatus = itens.filter((p) => norm(p.state) === norm(estado));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", gap: 16, alignItems: "stretch" }}>
      <GraficoPorEtapa titulo={tituloGrafico} estado={estado} itens={doStatus} carregando={carregando} />

      <Quadro titulo={tituloTabela} contagem={carregando ? null : doStatus.length}>
        <Tabela
          colunas={["Chamado", "PBI", "Título", "Esteira", "Etapa", "PO", "Classificação", "Observação"]}
          vazio={carregando ? "Carregando…" : `Nenhuma demanda em ${estado.toLowerCase()} para os filtros atuais.`}
          linhas={doStatus.map((p) => {
            const com = comentarios[p.id];
            const aguardandoComentario = p.qtdComentarios > 0 && com === undefined;
            return [
              { k: "chamado", v: p.idExterno || "—", nowrap: true },
              { k: "pbi", v: <LinkPbi p={p} />, nowrap: true },
              { k: "titulo", v: p.titulo, largo: true, minW: 220 },
              { k: "esteira", v: nomeCurtoDaSquad(p.areaPath) || "—", nowrap: true },
              { k: "etapa", v: p.etapa || "—", nowrap: true },
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
          chaves={doStatus.map((p) => p.id)}
          minWidth={1270}
        />
      </Quadro>
    </div>
  );
}

function GraficoPorEtapa({ titulo, estado, itens, carregando }: { titulo: string; estado: string; itens: PbiGestaoCliente[]; carregando: boolean }) {
  const porEtapa = new Map<string, number>();
  for (const p of itens) {
    const etapa = p.etapa || "Sem etapa";
    porEtapa.set(etapa, (porEtapa.get(etapa) ?? 0) + 1);
  }
  const dados = Array.from(porEtapa, ([etapa, qtd]) => ({ etapa, qtd })).sort((a, b) => b.qtd - a.qtd || a.etapa.localeCompare(b.etapa, "pt-BR"));
  const altura = Math.max(150, dados.length * 38 + 20);

  return (
    <div className="kmm-card" style={{ padding: "16px 16px 12px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 14, color: C.text }}>{titulo}</div>
        <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{carregando ? "…" : `${itens.length} ${itens.length === 1 ? "demanda" : "demandas"}`}</div>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Distribuição dos PBIs em {estado} entre as etapas.</div>
      {dados.length === 0 ? (
        <div style={{ padding: "28px 4px 16px", fontSize: 13, color: C.muted }}>{carregando ? "Carregando…" : `Nenhuma demanda em ${estado.toLowerCase()} para os filtros atuais.`}</div>
      ) : (
        <div style={{ height: altura, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 32, left: 4, bottom: 4 }}>
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis type="category" dataKey="etapa" width={165} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11.5, fill: C.text }} />
              <Tooltip cursor={{ fill: "transparent" }} formatter={(v: number) => [`${v} ${v === 1 ? "demanda" : "demandas"}`, estado]} />
              <Bar dataKey="qtd" radius={[0, 8, 8, 0]} barSize={18} minPointSize={4} isAnimationActive={false}>
                {dados.map((d, i) => (
                  <Cell key={d.etapa} fill={i === 0 ? BARRA_FORTE : BARRA_SUAVE} />
                ))}
                <LabelList dataKey="qtd" position="right" style={{ fontSize: 12, fontWeight: 600, fill: C.text }} />
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
      style={{ color: C.blue, textDecoration: "none", fontWeight: 500 }}
    >
      {p.id}
    </a>
  );
}

/** Cartão com título + contagem e a tabela; altura padrão ALTURA_QUADRO (a rolagem é da tabela). */
function Quadro({ titulo, contagem, children }: { titulo: string; contagem: number | null; children: React.ReactNode }) {
  return (
    <div className="kmm-card" style={{ padding: 0, overflow: "hidden", minWidth: 0, display: "flex", flexDirection: "column", height: ALTURA_QUADRO, minHeight: 340 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "15px 18px 12px" }}>
        <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 14, color: C.text }}>{titulo}</div>
        <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{contagem == null ? "…" : `${contagem} ${contagem === 1 ? "demanda" : "demandas"}`}</div>
      </div>
      {children}
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

/** Tabela suave com rolagem própria (vertical + horizontal visíveis) e cabeçalho fixo; preenche o quadro. */
function Tabela({
  colunas,
  linhas,
  chaves,
  vazio,
  minWidth,
  larguraTarefa = 200,
  altura,
}: {
  colunas: string[];
  linhas: Celula[][];
  chaves: number[];
  vazio: string;
  minWidth: number;
  /** Largura mínima da coluna de texto longo ("Tarefa"/"Título"). */
  larguraTarefa?: number;
  /** Altura fixa do quadro de rolagem (por padrão, ocupa o resto do quadro pai). */
  altura?: string;
}) {
  return (
    <div className="kmm-rolagem" style={{ overflow: "auto", flex: altura ? undefined : 1, height: altura, minHeight: 0, borderTop: `1px solid ${C.border}` }}>
      <table className="kmm-tab" style={{ minWidth: linhas.length ? minWidth : undefined }}>
        <thead>
          <tr>
            {colunas.map((h) => (
              <th key={h}>{h}</th>
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
              <tr key={chaves[i]}>
                {cels.map((c) => (
                  <td
                    key={c.k}
                    style={{
                      whiteSpace: c.nowrap ? "nowrap" : "normal",
                      minWidth: c.largo ? (c.minW ?? larguraTarefa) : undefined,
                      textAlign: c.num ? "right" : "left",
                      fontVariantNumeric: c.num ? "tabular-nums" : undefined,
                      fontWeight: c.forte ? 600 : 400,
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

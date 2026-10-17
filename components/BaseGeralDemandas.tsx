"use client";

import { C } from "@/lib/kmm-theme";
import { nomeCurtoDaSquad } from "@/lib/backlog";
import { formatarChaveDia } from "@/lib/datas";
import { agingDiasPbi, emBacklogDemanda, norm, type PbiGestaoCliente } from "@/lib/gestao-clientes";

const ORG_DEVOPS = "kmmbynstech";

/**
 * Seção "Base geral de demandas" da Gestão de clientes (pedido por Heder em 2026-10-17): divisor +
 * duas tabelas lado a lado, na proporção 3 : 1.
 * - "Demandas em backlog": State = Backlog nas etapas Backlog, Análise ou Comitê (mesma regra do
 *   indicador "Demandas em backlog"); o Agging aberto usa a MESMA regra do indicador de Agging de
 *   Viabilidade da tela principal (agingDiasPbi: hoje − Data Abertura Produto, ou Created Date).
 * - "Demandas em orçamento": State = Orçamento, com o total do Effort.
 * Cada tabela rola DENTRO do próprio quadro (altura limitada, cabeçalho fixo e barras sempre
 * visíveis) — a página não vira uma lista gigante com a rolagem lá no fim. Recebe os PBIs já
 * filtrados por cliente/squad, então acompanha os filtros da tela.
 */
export default function BaseGeralDemandas({ itens, carregando }: { itens: PbiGestaoCliente[]; carregando: boolean }) {
  const backlog = itens.filter(emBacklogDemanda);
  const orcamento = itens.filter((p) => norm(p.state) === "orcamento");
  const totalEffort = orcamento.reduce((acc, p) => acc + (p.effort ?? 0), 0);
  const agora = Date.now();

  return (
    <section style={{ marginTop: 36 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.text, margin: 0, whiteSpace: "nowrap" }}>
          Base geral de demandas
        </h2>
        <div style={{ flex: 1, height: 2, background: C.border, borderRadius: 2 }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
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
                { k: "po", v: p.po || "—" },
                { k: "abertura", v: dataCurta(p.dataAberturaProduto), nowrap: true, num: true },
                { k: "etapa", v: p.etapa || "—", nowrap: true },
                { k: "comite", v: dataCurta(p.dataComite), nowrap: true, num: true },
                { k: "aging", v: aging == null ? "—" : `${aging} d`, nowrap: true, num: true, forte: true },
              ];
            })}
            chaves={backlog.map((p) => p.id)}
            minWidth={1180}
          />
        </Quadro>

        <Quadro
          titulo="Demandas em orçamento"
          contagem={carregando ? null : orcamento.length}
          rodape={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Total effort</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                {carregando ? "…" : `${formatarNumero(totalEffort)} h`}
              </span>
            </div>
          }
        >
          <Tabela
            colunas={["Chamado", "Tarefa", "PBI", "Data comitê", "Effort"]}
            vazio={carregando ? "Carregando…" : "Nenhuma demanda em orçamento para os filtros atuais."}
            linhas={orcamento.map((p) => [
              { k: "chamado", v: p.idExterno || "—", nowrap: true },
              { k: "tarefa", v: p.titulo, largo: true },
              { k: "pbi", v: <LinkPbi p={p} />, nowrap: true },
              { k: "comite", v: dataCurta(p.dataComite), nowrap: true, num: true },
              { k: "effort", v: p.effort == null ? "—" : `${formatarNumero(p.effort)} h`, nowrap: true, num: true, forte: true },
            ])}
            chaves={orcamento.map((p) => p.id)}
            minWidth={440}
            larguraTarefa={130}
          />
        </Quadro>
      </div>
    </section>
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

type Celula = { k: string; v: React.ReactNode; nowrap?: boolean; largo?: boolean; num?: boolean; forte?: boolean };

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
  /** Largura mínima da coluna "Tarefa" (a tabela estreita usa menos, pra rolar menos na horizontal). */
  larguraTarefa?: number;
}) {
  return (
    <div className="kmm-rolagem" style={{ overflow: "auto", maxHeight: "min(560px, calc(100vh - 220px))", minHeight: 160, borderTop: `1px solid ${C.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth }}>
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
                      minWidth: c.largo ? larguraTarefa : undefined,
                      textAlign: c.num ? "right" : "left",
                      fontVariantNumeric: c.num ? "tabular-nums" : undefined,
                      fontWeight: c.forte ? 700 : 400,
                      color: C.text,
                    }}
                  >
                    {c.largo ? (
                      <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={typeof c.v === "string" ? c.v : undefined}>
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

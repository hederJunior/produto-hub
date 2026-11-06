"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Info, Layers } from "lucide-react";
import { useProduto } from "@/components/ProdutoContext";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import { C, PASTEL, infoPrioridade } from "@/lib/kmm-theme";
import { nomeCurtoDaSquad } from "@/lib/backlog";
import { QUADROS_DOWNSTREAM, type DivisaoDownstream, type ItemKanbanDownstream } from "@/lib/kanban-downstream";

/**
 * Downstream > Kanban (pedido por Heder em 2026-11-05), no mesmo modelo do Kanban do Upstream: PBIs em
 * execução distribuídos em 5 quadros (alguns com subdivisões internas) — Ag. priorização, Refinamento,
 * Desenvolvimento, Validação interna e Aguardando Deploy. As regras (State + Etapa + Tag) ficam em
 * lib/kanban-downstream.ts e o informativo "Regras do fluxo" fica recolhido por padrão. Respeita o
 * produto escolhido no topo da página (KMM4, KMM5 ou ambos).
 */

const ORG_DEVOPS = "kmmbynstech";
const SEM_RESPONSAVEL = "Sem responsável";

// Hover/foco dos cards (inline style não cobre :hover).
const ESTILO_LOCAL = `
.kd-card{ transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
.kd-card:hover{ transform: translateY(-1px); box-shadow: 0 6px 18px rgba(30,27,24,.07); border-color:#DDD6CC; }
.kd-id:hover{ color:#FC4C02 !important; }
.kd-scroll::-webkit-scrollbar{ width:6px; height:8px; }
.kd-scroll::-webkit-scrollbar-thumb{ background:#DAD5CD; border-radius:6px; }
`;

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  return ((partes[0][0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export default function KanbanDownstream({ refreshKey = 0 }: { refreshKey?: number }) {
  const { produto } = useProduto();
  const [itens, setItens] = useState<ItemKanbanDownstream[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Filtros multi-seleção: vazio = todas as áreas / todos os responsáveis.
  const [areasSel, setAreasSel] = useState<string[]>([]);
  const [responsaveisSel, setResponsaveisSel] = useState<string[]>([]);
  const [infoAberto, setInfoAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    fetch(`/api/roadmap/kanban-downstream?produto=${produto}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (cancelado) return;
        if (j.erro) setErro(j.erro);
        setItens(j.itens ?? []);
        setAvisos(j.avisos ?? []);
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar o Kanban do Azure DevOps."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [produto, refreshKey]);

  // Áreas oferecidas = as que têm demanda no Kanban. Nome curto; se o mesmo nome existe em KMM4 e KMM5
  // (ex.: "Melhorias"), o projeto entra entre parênteses.
  const opcoesArea = useMemo(
    () => Array.from(new Set(itens.map((i) => i.areaPath).filter(Boolean))).sort((a, b) => nomeCurtoDaSquad(a).localeCompare(nomeCurtoDaSquad(b), "pt-BR")),
    [itens]
  );
  const rotuloArea = useMemo(() => {
    const vistos = new Set<string>();
    const repetidos = new Set<string>();
    for (const a of opcoesArea) {
      const curto = nomeCurtoDaSquad(a);
      if (vistos.has(curto)) repetidos.add(curto);
      vistos.add(curto);
    }
    return (areaPath: string) => {
      const curto = nomeCurtoDaSquad(areaPath);
      return repetidos.has(curto) ? `${curto} (${areaPath.split("\\")[0]})` : curto;
    };
  }, [opcoesArea]);
  useEffect(() => {
    setAreasSel((sel) => (sel.every((a) => opcoesArea.includes(a)) ? sel : sel.filter((a) => opcoesArea.includes(a))));
  }, [opcoesArea]);

  const itensDasAreas = useMemo(() => (areasSel.length ? itens.filter((i) => areasSel.includes(i.areaPath)) : itens), [itens, areasSel]);

  // Responsáveis oferecidos = os das áreas escolhidas (não adianta listar quem não tem card nelas).
  const opcoesResponsavel = useMemo(() => {
    const nomes = new Set(itensDasAreas.map((i) => i.responsavel).filter(Boolean));
    const lista = Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return itensDasAreas.some((i) => !i.responsavel) ? [...lista, SEM_RESPONSAVEL] : lista;
  }, [itensDasAreas]);
  useEffect(() => {
    setResponsaveisSel((sel) => (sel.every((r) => opcoesResponsavel.includes(r)) ? sel : sel.filter((r) => opcoesResponsavel.includes(r))));
  }, [opcoesResponsavel]);

  const itensVisiveis = useMemo(
    () => (responsaveisSel.length ? itensDasAreas.filter((i) => responsaveisSel.includes(i.responsavel || SEM_RESPONSAVEL)) : itensDasAreas),
    [itensDasAreas, responsaveisSel]
  );

  // Em cada divisão: mais prioritário primeiro (1 = Crítica; sem prioridade por último), depois o mais antigo.
  const porDivisao = useMemo(() => {
    const mapa: Record<string, ItemKanbanDownstream[]> = {};
    for (const i of itensVisiveis) (mapa[i.divisao] ??= []).push(i);
    for (const lista of Object.values(mapa)) {
      lista.sort((a, b) => (a.prioridade ?? 99) - (b.prioridade ?? 99) || a.createdDate.localeCompare(b.createdDate) || a.id - b.id);
    }
    return mapa;
  }, [itensVisiveis]);

  return (
    <div>
      <style>{ESTILO_LOCAL}</style>

      {/* Barra: filtros de área e responsável + informativo recolhido */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Área</span>
          <MultiSelectFiltro
            rotuloTodos="Todas as áreas"
            opcoes={opcoesArea}
            selecionados={areasSel}
            onChange={setAreasSel}
            formatar={rotuloArea}
            pesquisavel
            placeholderBusca="Digite o nome da área…"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Responsável</span>
          <MultiSelectFiltro
            rotuloTodos="Todos os responsáveis"
            opcoes={opcoesResponsavel}
            selecionados={responsaveisSel}
            onChange={setResponsaveisSel}
            pesquisavel
            placeholderBusca="Digite o nome do responsável…"
          />
        </div>
        {!carregando && !erro && (
          <span style={{ fontSize: 12, color: C.muted }}>
            {itensVisiveis.length} {itensVisiveis.length === 1 ? "demanda" : "demandas"}
          </span>
        )}
        <button
          className="kmm-btn"
          style={{ marginLeft: "auto", ...(infoAberto ? { borderColor: C.orange, color: C.orange, background: "#FFF1EA" } : {}) }}
          aria-pressed={infoAberto}
          aria-expanded={infoAberto}
          onClick={() => setInfoAberto((v) => !v)}
        >
          <Info size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Regras do fluxo
        </button>
      </div>

      {infoAberto && <RegrasDoFluxo />}

      {erro && <div className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: C.red }}>{erro}</div>}
      {avisos.map((a) => (
        <div key={a} className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: "#8a5a00", background: "#fff6e0" }}>{a}</div>
      ))}

      {carregando ? (
        <p style={{ color: C.muted }}>Carregando demandas do Azure DevOps…</p>
      ) : (
        <div className="kd-scroll" style={{ overflowX: "auto", paddingBottom: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(270px, 1fr))", gap: 14, minWidth: 1440, alignItems: "start" }}>
            {QUADROS_DOWNSTREAM.map((quadro) => {
              const cor = PASTEL[quadro.cor];
              const total = quadro.divisoes.reduce((n, d) => n + (porDivisao[d.chave]?.length ?? 0), 0);
              const subdividido = quadro.divisoes.length > 1;
              return (
                <section key={quadro.chave} aria-label={quadro.titulo} style={{ background: C.soft, borderRadius: 16, borderTop: `3px solid ${cor.dot}`, padding: "12px 10px 10px" }}>
                  <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 10px" }}>
                    <span style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 13.5, color: C.text }}>{quadro.titulo}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: C.muted, background: "#fff", borderRadius: 999, padding: "1px 9px", fontVariantNumeric: "tabular-nums" }}>
                      {total}
                    </span>
                  </header>

                  <div style={{ display: "flex", flexDirection: "column", gap: subdividido ? 12 : 0 }}>
                    {quadro.divisoes.map((div) => (
                      <Divisao key={div.chave} divisao={div} cards={porDivisao[div.chave] ?? []} cor={cor} subdividido={subdividido} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Divisao({ divisao, cards, cor, subdividido }: { divisao: DivisaoDownstream; cards: ItemKanbanDownstream[]; cor: { bg: string; dot: string }; subdividido: boolean }) {
  return (
    <div
      aria-label={subdividido ? divisao.titulo : undefined}
      style={subdividido ? { background: cor.bg, borderRadius: 12, padding: "9px 8px 8px" } : undefined}
    >
      {subdividido && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 4px 8px" }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: cor.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{divisao.titulo}</span>
          <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: C.muted, background: "#fff", borderRadius: 999, padding: "0 8px", fontVariantNumeric: "tabular-nums" }}>
            {cards.length}
          </span>
        </div>
      )}
      <div className="kd-scroll" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: subdividido ? "32vh" : "66vh", overflowY: "auto", paddingRight: 2 }}>
        {cards.length === 0 ? (
          <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "18px 12px", textAlign: "center", fontSize: 12.5, color: C.faint, background: subdividido ? "rgba(255,255,255,.55)" : undefined }}>
            Sem demandas
          </div>
        ) : (
          cards.map((i) => <CardDownstream key={i.id} item={i} cor={cor} />)
        )}
      </div>
    </div>
  );
}

/** Quadro de regras do fluxo: só Status, Etapa e Tag de cada quadro/divisão. */
function RegrasDoFluxo() {
  return (
    <div className="kmm-card" style={{ marginBottom: 16, padding: "16px 18px" }}>
      <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Como cada quadro funciona</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        {QUADROS_DOWNSTREAM.map((q) => {
          const cor = PASTEL[q.cor];
          return (
            <div key={q.chave} style={{ background: cor.bg, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cor.dot }} />
                {q.titulo}
              </div>
              {q.divisoes.map((d, idx) => (
                <div key={d.chave} style={idx ? { borderTop: "1px solid rgba(30,27,24,.08)", marginTop: 9, paddingTop: 9 } : undefined}>
                  {d.titulo && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", marginBottom: 4 }}>
                      <Layers size={11} />
                      {d.titulo}
                    </div>
                  )}
                  <dl style={{ margin: 0, fontSize: 12.5, display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px" }}>
                    <dt style={{ color: C.muted }}>Status</dt>
                    <dd style={{ margin: 0 }}>{d.status}</dd>
                    <dt style={{ color: C.muted }}>Etapa</dt>
                    <dd style={{ margin: 0 }}>{d.etapa}</dd>
                    {d.tag && (
                      <>
                        <dt style={{ color: C.muted }}>Tag</dt>
                        <dd style={{ margin: 0 }}>{d.tag}</dd>
                      </>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardDownstream({ item, cor }: { item: ItemKanbanDownstream; cor: { bg: string; dot: string } }) {
  const prio = item.prioridade != null ? infoPrioridade(item.prioridade) : null;

  return (
    <article className="kd-card" style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 12px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <a
          className="kd-id"
          href={`https://dev.azure.com/${ORG_DEVOPS}/${encodeURIComponent(item.projeto)}/_workitems/edit/${item.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, textDecoration: "none", fontVariantNumeric: "tabular-nums", letterSpacing: ".01em" }}
        >
          #{item.id}
        </a>
        {prio && (
          <span title={`Prioridade ${prio.label}`} style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 600, padding: "1px 8px", borderRadius: 999, background: prio.bg, color: prio.fg }}>
            {prio.label}
          </span>
        )}
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.38, color: C.text, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={item.titulo}>
        {item.titulo}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
        {item.cliente && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, background: cor.bg, color: C.text, borderRadius: 7, padding: "2px 8px", maxWidth: "100%" }}>
            <Building2 size={11} color={cor.dot} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.cliente}</span>
          </span>
        )}
        <span title={item.areaPath} style={{ display: "inline-flex", alignItems: "center", fontSize: 11.5, background: "#fff", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 7, padding: "1px 8px", maxWidth: "100%" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeCurtoDaSquad(item.areaPath)}</span>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.soft}` }}>
        {item.po ? (
          <>
            <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", background: cor.bg, color: cor.dot, fontSize: 9.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {iniciais(item.po)}
            </span>
            <span title={`PO: ${item.po}`} style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.po}</span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: C.faint }}>Sem PO</span>
        )}
      </div>
    </article>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, Clock, Info } from "lucide-react";
import { useProduto } from "@/components/ProdutoContext";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import { C, PASTEL, infoPrioridade } from "@/lib/kmm-theme";
import { chaveDia, diasEntreChaves, formatarChaveDia } from "@/lib/datas";
import { DIAS_ALERTA_BACKLOG } from "@/lib/backlog";
import { AREAS_KANBAN, COLUNAS_KANBAN, type AreaKanban, type ItemKanban } from "@/lib/kanban-upstream";

/**
 * Upstream > Kanban (pedido por Heder em 2026-11-03): distribuição das demandas da carteira por
 * etapa do fluxo — Backlog Produto, Comitê, Em Análise Tech e Orçamento — para UMA área por vez
 * (filtro de seleção única). As regras de cada coluna ficam em lib/kanban-upstream.ts e o
 * informativo "Quando a demanda avança" fica recolhido por padrão.
 */

const ORG_DEVOPS = "kmmbynstech";
const SEM_RESPONSAVEL = "Sem responsável";

// Hover/foco dos cards (inline style não cobre :hover).
const ESTILO_LOCAL = `
.kb-card{ transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
.kb-card:hover{ transform: translateY(-1px); box-shadow: 0 6px 18px rgba(30,27,24,.07); border-color:#DDD6CC; }
.kb-id:hover{ color:#FC4C02 !important; }
.kb-scroll::-webkit-scrollbar{ width:6px; height:8px; }
.kb-scroll::-webkit-scrollbar-thumb{ background:#DAD5CD; border-radius:6px; }
`;

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  return ((partes[0][0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export default function KanbanUpstream({ refreshKey = 0 }: { refreshKey?: number }) {
  const { produto } = useProduto();
  const [itens, setItens] = useState<ItemKanban[]>([]);
  const [areas, setAreas] = useState<AreaKanban[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [areaSel, setAreaSel] = useState<string>("");
  // Filtro "Responsável" (System.AssignedTo do PBI); vazio = todos. SEM_RESPONSAVEL agrupa os não atribuídos.
  const [responsaveisSel, setResponsaveisSel] = useState<string[]>([]);
  const [infoAberto, setInfoAberto] = useState(false);

  // As áreas do Kanban só existem no KMM5 — com KMM4 selecionado não há o que carregar.
  const semKanban = produto === "KMM4";

  useEffect(() => {
    if (semKanban) {
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    fetch("/api/roadmap/kanban-upstream", { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (cancelado) return;
        if (j.erro) setErro(j.erro);
        setItens(j.itens ?? []);
        setAreas(j.areas ?? []);
        setAvisos(j.avisos ?? []);
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar o Kanban do Azure DevOps."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [semKanban, refreshKey]);

  // Opções do filtro na ordem pedida (AREAS_KANBAN), só as que existem no Azure.
  const opcoesArea = useMemo<string[]>(() => AREAS_KANBAN.map((a) => a.rotulo as string).filter((r) => areas.some((x) => x.rotulo === r)), [areas]);

  // Seleção única: sempre há uma área escolhida (a primeira da lista até o usuário trocar).
  useEffect(() => {
    if (opcoesArea.length && !opcoesArea.includes(areaSel)) setAreaSel(opcoesArea[0]);
  }, [opcoesArea, areaSel]);

  const hojeChave = chaveDia(new Date());

  const itensDaArea = useMemo(() => {
    const caminhos = areas.filter((a) => a.rotulo === areaSel).map((a) => a.valor);
    return itens.filter((i) => caminhos.some((c) => i.areaPath === c || i.areaPath.startsWith(c + "\\")));
  }, [itens, areas, areaSel]);

  // Responsáveis oferecidos = os da área escolhida (não adianta listar quem não tem card nela).
  const opcoesResponsavel = useMemo(() => {
    const nomes = new Set(itensDaArea.map((i) => i.responsavel).filter(Boolean));
    const lista = Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return itensDaArea.some((i) => !i.responsavel) ? [...lista, SEM_RESPONSAVEL] : lista;
  }, [itensDaArea]);
  useEffect(() => {
    setResponsaveisSel((sel) => (sel.every((r) => opcoesResponsavel.includes(r)) ? sel : sel.filter((r) => opcoesResponsavel.includes(r))));
  }, [opcoesResponsavel]);

  const itensVisiveis = useMemo(
    () => (responsaveisSel.length ? itensDaArea.filter((i) => responsaveisSel.includes(i.responsavel || SEM_RESPONSAVEL)) : itensDaArea),
    [itensDaArea, responsaveisSel]
  );

  // Ordem das colunas: Backlog Produto pela Created Date e Comitê pela Data de Comitê, ambas da menor
  // (mais antiga) para a maior (pedido por Heder em 2026-11-04). As demais: mais prioritário primeiro
  // (1 = Crítica; sem prioridade por último), depois o mais antigo. Sem data vai sempre para o fim.
  const porColuna = useMemo(() => {
    const porData = (a: string | null | undefined, b: string | null | undefined) => (a || "9999").localeCompare(b || "9999");
    const ordenadores: Record<string, (a: ItemKanban, b: ItemKanban) => number> = {
      backlog: (a, b) => porData(a.createdDate, b.createdDate) || a.id - b.id,
      comite: (a, b) => porData(a.dataComite, b.dataComite) || a.id - b.id,
    };
    const padrao = (a: ItemKanban, b: ItemKanban) =>
      (a.prioridade ?? 99) - (b.prioridade ?? 99) || a.createdDate.localeCompare(b.createdDate) || a.id - b.id;
    return Object.fromEntries(
      COLUNAS_KANBAN.map((c) => [c.chave, itensVisiveis.filter((i) => i.coluna === c.chave).sort(ordenadores[c.chave] ?? padrao)])
    );
  }, [itensVisiveis]);

  if (semKanban) {
    return <p style={{ color: C.muted }}>As áreas do Kanban existem apenas no KMM5. Selecione KMM5 ou Ambos no topo da página.</p>;
  }

  return (
    <div>
      <style>{ESTILO_LOCAL}</style>

      {/* Barra: filtro de área (seleção única) + informativo recolhido */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Área</span>
          <select className="kmm-input" style={{ width: "auto", minWidth: 200 }} value={areaSel} onChange={(e) => setAreaSel(e.target.value)} disabled={!opcoesArea.length}>
            {opcoesArea.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
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
        {!carregando && !erro && opcoesArea.length > 0 && (
          <span style={{ fontSize: 12, color: C.muted }}>
            {itensVisiveis.length} {itensVisiveis.length === 1 ? "demanda" : "demandas"} em {areaSel}
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

      {infoAberto && (
        <div className="kmm-card" style={{ marginBottom: 16, padding: "16px 18px" }}>
          <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Como cada coluna funciona</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {COLUNAS_KANBAN.map((c) => (
              <div key={c.chave} style={{ background: PASTEL[c.cor].bg, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: PASTEL[c.cor].dot }} />
                  {c.titulo}
                </div>
                <dl style={{ margin: 0, fontSize: 12.5, display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px" }}>
                  <dt style={{ color: C.muted }}>Status</dt>
                  <dd style={{ margin: 0 }}>{c.status}</dd>
                  <dt style={{ color: C.muted }}>Etapa</dt>
                  <dd style={{ margin: 0 }}>{c.etapa}</dd>
                  {c.tag && (
                    <>
                      <dt style={{ color: C.muted }}>Tag</dt>
                      <dd style={{ margin: 0 }}>{c.tag}</dd>
                    </>
                  )}
                </dl>
                <div style={{ borderTop: `1px solid rgba(30,27,24,.08)`, marginTop: 10, paddingTop: 9 }}>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", marginBottom: 3 }}>Quando que a demanda avança para a próxima etapa:</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{c.avanca}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {erro && <div className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: C.red }}>{erro}</div>}
      {avisos.map((a) => (
        <div key={a} className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: "#8a5a00", background: "#fff6e0" }}>{a}</div>
      ))}

      {carregando ? (
        <p style={{ color: C.muted }}>Carregando demandas do Azure DevOps…</p>
      ) : !opcoesArea.length ? (
        !erro && <p style={{ color: C.muted }}>Nenhuma das áreas do Kanban foi encontrada no Azure DevOps.</p>
      ) : (
        <div className="kb-scroll" style={{ overflowX: "auto", paddingBottom: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(260px, 1fr))", gap: 14, minWidth: 1080, alignItems: "start" }}>
            {COLUNAS_KANBAN.map((col) => {
              const cards = porColuna[col.chave] ?? [];
              const cor = PASTEL[col.cor];
              return (
                <section key={col.chave} aria-label={col.titulo} style={{ background: C.soft, borderRadius: 16, borderTop: `3px solid ${cor.dot}`, padding: "12px 10px 10px" }}>
                  <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 10px" }}>
                    <span style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 13.5, color: C.text }}>{col.titulo}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: C.muted, background: "#fff", borderRadius: 999, padding: "1px 9px", fontVariantNumeric: "tabular-nums" }}>
                      {cards.length}
                    </span>
                  </header>
                  <div className="kb-scroll" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "62vh", overflowY: "auto", paddingRight: 2 }}>
                    {cards.length === 0 ? (
                      <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "22px 12px", textAlign: "center", fontSize: 12.5, color: C.faint }}>Sem demandas</div>
                    ) : (
                      cards.map((i) => <CardKanban key={i.id} item={i} cor={cor} hojeChave={hojeChave} mostrarComite={col.chave === "comite"} />)
                    )}
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

function CardKanban({ item, cor, hojeChave, mostrarComite }: { item: ItemKanban; cor: { bg: string; dot: string }; hojeChave: string; mostrarComite: boolean }) {
  const prio = item.prioridade != null ? infoPrioridade(item.prioridade) : null;
  const dias = item.createdDate ? diasEntreChaves(chaveDia(item.createdDate), hojeChave) : null;
  const alerta = dias != null && dias > DIAS_ALERTA_BACKLOG;

  return (
    <article className="kb-card" style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 12px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <a
          className="kb-id"
          href={`https://dev.azure.com/${ORG_DEVOPS}/KMM5/_workitems/edit/${item.id}`}
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

      {(item.cliente || (mostrarComite && item.dataComite)) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
          {item.cliente && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, background: cor.bg, color: C.text, borderRadius: 7, padding: "2px 8px", maxWidth: "100%" }}>
              <Building2 size={11} color={cor.dot} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.cliente}</span>
            </span>
          )}
          {mostrarComite && item.dataComite && (
            <span title="Data de Comitê" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, background: "#fff", border: `1px solid ${C.border}`, color: C.text, borderRadius: 7, padding: "1px 8px" }}>
              <CalendarDays size={11} color={cor.dot} />
              {formatarChaveDia(item.dataComite.slice(0, 10))}
            </span>
          )}
        </div>
      )}

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
        {dias != null && (
          <span title={`Aberto há ${dias} dia(s)`} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: alerta ? 600 : 500, color: alerta ? C.red : C.muted, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
            <Clock size={11} />
            {dias}d
          </span>
        )}
      </div>
    </article>
  );
}

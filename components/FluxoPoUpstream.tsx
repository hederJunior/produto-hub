"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Building2, CalendarDays, CheckCircle2, Clock, Eye, GitBranch } from "lucide-react";
import { useProduto } from "@/components/ProdutoContext";
import { C, PASTEL, infoPrioridade } from "@/lib/kmm-theme";
import { formatarChaveDia } from "@/lib/datas";
import { urlPbiAzure } from "@/lib/fluxo-po-campos";
import {
  ETAPAS_FLUXO,
  agingEmAlerta,
  agingEmDias,
  agruparPorEtapa,
  chaveDia,
  contarPorEtapa,
  comiteAtrasado,
  ehMeuItem,
  estaNaAreaRaiz,
  resumirFalta,
  type CardFluxo,
  type EtapaFluxo,
} from "@/lib/fluxo-po";

type Esteira = { valor: string; rotulo: string };
type Eu = { email: string | null; nome: string | null };
type Resposta = { cards: CardFluxo[]; esteiras: Esteira[]; avisos: string[]; podeMovimentar: boolean; permissao?: { pode: boolean; motivo: string | null }; eu: Eu; erro?: string };

// Uma cor por coluna (as 3 primeiras são as etapas com movimento na Fase 1).
const COR_DA_ETAPA: Record<EtapaFluxo, { bg: string; dot: string }> = {
  "1.1": PASTEL.sky,
  "1.2": PASTEL.indigo,
  "2.1": PASTEL.purple,
  "3.1": PASTEL.amber,
  "3.2": PASTEL.orange,
  "4.1": PASTEL.green,
};

// Hover dos cards (inline style não cobre :hover).
const ESTILO_LOCAL = `
.fp-card{ transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
.fp-card:hover{ transform: translateY(-1px); box-shadow: 0 6px 18px rgba(30,27,24,.07); border-color:#DDD6CC; }
.fp-id:hover{ color:#FC4C02 !important; }
.fp-scroll::-webkit-scrollbar{ width:6px; height:8px; }
.fp-scroll::-webkit-scrollbar-thumb{ background:#DAD5CD; border-radius:6px; }
`;

/** "KMM5\TMS - Dedicada Maroni" → "TMS - Dedicada Maroni"; a raiz KMM5 (sem esteira definida) vira um texto claro. */
function rotuloDaArea(areaPath: string): string {
  if (estaNaAreaRaiz(areaPath)) return "KMM5 (sem esteira)";
  return areaPath.replace(/^KMM5\\/i, "");
}

/** Os 6 quadros do Upstream. Sem Triagem (feita pelo Atendimento em outra ferramenta). */
export default function FluxoPoUpstream() {
  const { produto } = useProduto();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [esteiraSel, setEsteiraSel] = useState("");
  const [meusItens, setMeusItens] = useState(false);
  const [somenteBloqueados, setSomenteBloqueados] = useState(false);
  const [hoje] = useState(() => new Date());

  // O fluxo existe só no KMM5 — com KMM4 selecionado não há o que carregar.
  const semFluxo = produto === "KMM4";

  useEffect(() => {
    if (semFluxo) {
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    fetch("/api/fluxo-po/upstream", { cache: "no-store" })
      .then((res) => res.json())
      .then((j: Resposta) => {
        if (cancelado) return;
        if (j.erro) setErro(j.erro);
        setDados(j);
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar o quadro do Azure DevOps."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [semFluxo]);

  const cards = dados?.cards ?? [];
  const eu: Eu = dados?.eu ?? { email: null, nome: null };

  // Esteira escolhida + os cards da raiz KMM5 (etapa 1.1, ainda sem esteira, são de quem vai classificar para qualquer uma).
  const visiveis = useMemo(
    () =>
      cards.filter((c) => {
        const area = c.pbi.areaPath;
        if (esteiraSel && !(estaNaAreaRaiz(area) || area === esteiraSel || area.startsWith(`${esteiraSel}\\`))) return false;
        if (meusItens && !ehMeuItem(c.pbi, eu)) return false;
        return true;
      }),
    [cards, esteiraSel, meusItens, eu.email, eu.nome] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Contadores por coluna (prontos e bloqueados): sobre os cards dos filtros de esteira e meus itens. O filtro
  // "Somente bloqueados" não os zera, senão o número de prontos sumiria justamente quando ele está ligado.
  const contadores = useMemo(() => contarPorEtapa(visiveis.map((c) => c.pbi)), [visiveis]);
  const totalBloqueados = ETAPAS_FLUXO.reduce((soma, e) => soma + contadores[e.codigo].bloqueados, 0);

  // "Somente bloqueados": cards de etapas com movimento que ainda não cumprem a regra (inclui os inconsistentes).
  const exibidos = useMemo(() => (somenteBloqueados ? visiveis.filter((c) => c.prontidao && !c.prontidao.pronto) : visiveis), [visiveis, somenteBloqueados]);

  const porEtapa = useMemo(() => {
    const por = agruparPorEtapa(exibidos);
    // Comitê: a Data Comitê mais próxima (ou já vencida) primeiro; sem data por último.
    por["2.1"] = [...por["2.1"]].sort((a, b) => (chaveDia(a.pbi.dataComite) ?? "9999").localeCompare(chaveDia(b.pbi.dataComite) ?? "9999") || a.pbi.id - b.pbi.id);
    return por;
  }, [exibidos]);

  if (semFluxo) {
    return (
      <div className="kmm-card" style={{ fontSize: 13, color: "#8a5a00", background: "#fff6e0" }}>
        O Fluxo do PO existe só no KMM5. Selecione KMM5 (ou Ambos) no filtro Produto para ver a esteira.
      </div>
    );
  }

  const semIdentificacao = !eu.nome && !eu.email;

  return (
    <div>
      <style>{ESTILO_LOCAL}</style>

      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Esteira</span>
          <select className="kmm-input" style={{ width: "auto", minWidth: 220 }} value={esteiraSel} onChange={(e) => setEsteiraSel(e.target.value)} disabled={!dados?.esteiras.length}>
            <option value="">Todas as esteiras</option>
            {(dados?.esteiras ?? []).map((e) => (
              <option key={e.valor} value={e.valor}>{e.rotulo}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="kmm-btn"
          aria-pressed={meusItens}
          title={semIdentificacao ? "Seu cadastro não tem nome nem e-mail para identificar seus itens" : "Mostra só os PBIs em que você é o PO ou o responsável"}
          onClick={() => setMeusItens((v) => !v)}
          style={meusItens ? { borderColor: C.orange, color: C.orange, background: "#FFF1EA" } : undefined}
        >
          Meus itens
        </button>
        <button
          type="button"
          className="kmm-btn"
          aria-pressed={somenteBloqueados}
          title="Mostra só os cards que ainda não cumprem a regra para avançar"
          onClick={() => setSomenteBloqueados((v) => !v)}
          style={somenteBloqueados ? { borderColor: C.orange, color: C.orange, background: "#FFF1EA" } : undefined}
        >
          Somente bloqueados{dados ? ` (${totalBloqueados})` : ""}
        </button>
        {!carregando && !erro && (
          <span style={{ fontSize: 12, color: C.muted }}>
            {exibidos.length} {exibidos.length === 1 ? "demanda" : "demandas"}
            {esteiraSel ? ` em ${esteiras(dados, esteiraSel)} (mais os cards sem esteira)` : ""}
            {meusItens ? " suas" : ""}
          </span>
        )}
        {dados && !carregando && (
          <span
            title={dados.podeMovimentar ? "Seu perfil pode movimentar cards" : (dados.permissao?.motivo ?? "Seu perfil só visualiza o fluxo")}
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "4px 11px", background: dados.podeMovimentar ? PASTEL.green.bg : C.soft, color: dados.podeMovimentar ? PASTEL.green.dot : C.muted }}
          >
            {dados.podeMovimentar ? <GitBranch size={13} /> : <Eye size={13} />}
            {dados.podeMovimentar ? "Você pode movimentar" : "Somente visualização"}
          </span>
        )}
      </div>

      {erro && <div className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: C.red }}>{erro}</div>}
      {(dados?.avisos ?? []).map((a) => (
        <div key={a} className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: "#8a5a00", background: "#fff6e0" }}>{a}</div>
      ))}

      {carregando ? (
        <p style={{ color: C.muted }}>Carregando demandas do Azure DevOps…</p>
      ) : (
        <div className="fp-scroll" style={{ overflowX: "auto", paddingBottom: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(250px, 1fr))", gap: 14, minWidth: 1620, alignItems: "start" }}>
            {ETAPAS_FLUXO.map((etapa) => {
              const lista = porEtapa[etapa.codigo];
              const cor = COR_DA_ETAPA[etapa.codigo];
              return (
                <section key={etapa.codigo} aria-label={`${etapa.codigo} ${etapa.nome}`} style={{ background: C.soft, borderRadius: 16, borderTop: `3px solid ${cor.dot}`, padding: "12px 10px 10px" }}>
                  <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 10px" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 13.5, color: C.text, lineHeight: 1.25 }}>
                        <span style={{ color: cor.dot }}>{etapa.codigo}</span> {etapa.nome}
                      </div>
                      {!etapa.movimenta && <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>Somente exibição</div>}
                      {etapa.movimenta && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
                          <span title="Cards que já cumprem a regra para avançar" style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "1px 8px", background: PASTEL.green.bg, color: PASTEL.green.dot }}>
                            {contadores[etapa.codigo].prontos} {contadores[etapa.codigo].prontos === 1 ? "pronto" : "prontos"}
                          </span>
                          <span title="Cards a que ainda falta algo para avançar" style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "1px 8px", background: PASTEL.amber.bg, color: PASTEL.amber.dot }}>
                            {contadores[etapa.codigo].bloqueados} {contadores[etapa.codigo].bloqueados === 1 ? "bloqueado" : "bloqueados"}
                          </span>
                        </div>
                      )}
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: C.muted, background: "#fff", borderRadius: 999, padding: "1px 9px", fontVariantNumeric: "tabular-nums" }}>
                      {lista.length}
                    </span>
                  </header>
                  <div className="fp-scroll" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "62vh", overflowY: "auto", paddingRight: 2 }}>
                    {lista.length === 0 ? (
                      <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "22px 12px", textAlign: "center", fontSize: 12.5, color: C.faint }}>Sem demandas</div>
                    ) : (
                      lista.map((c) => <CardEsteira key={c.pbi.id} card={c} cor={cor} hoje={hoje} />)
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

function esteiras(dados: Resposta | null, valor: string): string {
  return dados?.esteiras.find((e) => e.valor === valor)?.rotulo ?? valor;
}

/**
 * Card da esteira, com os campos de cada coluna (docs/fluxo-po-decisoes.md §5):
 * 1.1 número, título, aging e cliente · 1.2 + Area Path e prioridade · 2.1 número, título, Area Path, Data Comitê
 * (com indicativo de atraso), cliente e prioridade · 3.1, 3.2 e 4.1 número, título, Area Path, cliente e prioridade.
 */
function CardEsteira({ card, cor, hoje }: { card: CardFluxo; cor: { bg: string; dot: string }; hoje: Date }) {
  const { pbi, etapa } = card;
  const mostrarArea = etapa !== "1.1";
  const mostrarPrioridade = etapa !== "1.1";
  const mostrarAging = etapa === "1.1" || etapa === "1.2";
  const mostrarComite = etapa === "2.1";

  const prio = mostrarPrioridade && pbi.prioridade !== null && pbi.prioridade >= 1 && pbi.prioridade <= 4 ? infoPrioridade(pbi.prioridade) : null;
  const dias = mostrarAging ? agingEmDias(pbi, hoje) : null;
  const agingVermelho = agingEmAlerta(dias);
  const diaComite = chaveDia(pbi.dataComite);
  const atrasada = mostrarComite && comiteAtrasado(pbi.dataComite, hoje);

  return (
    <article
      className="fp-card"
      style={{ background: card.inconsistencia ? "#FFF8F7" : "#fff", border: card.inconsistencia ? `1.5px solid ${C.red}` : `1px solid ${C.border}`, borderRadius: 12, padding: "11px 12px 10px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <a
          className="fp-id"
          href={urlPbiAzure(pbi.id)}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir o PBI no Azure DevOps"
          style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, textDecoration: "none", fontVariantNumeric: "tabular-nums", letterSpacing: ".01em" }}
        >
          #{pbi.id}
        </a>
        {prio && (
          <span title={`Prioridade ${prio.label}`} style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 600, padding: "1px 8px", borderRadius: 999, background: prio.bg, color: prio.fg }}>
            {prio.label}
          </span>
        )}
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.38, color: C.text, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={pbi.titulo}>
        {pbi.titulo}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
        {pbi.cliente && (
          <span title="Cliente" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, background: cor.bg, color: C.text, borderRadius: 7, padding: "2px 8px", maxWidth: "100%" }}>
            <Building2 size={11} color={cor.dot} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pbi.cliente}</span>
          </span>
        )}
        {mostrarArea && (
          <span title={`Area Path: ${pbi.areaPath}`} style={{ fontSize: 11.5, background: "#fff", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 7, padding: "1px 8px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {rotuloDaArea(pbi.areaPath)}
          </span>
        )}
      </div>

      {card.inconsistencia ? (
        <div role="alert" title={card.inconsistencia} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 9, fontSize: 11.5, fontWeight: 600, color: C.red, background: "#FBE7E4", borderRadius: 8, padding: "5px 8px" }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Inconsistente: {card.inconsistencia}</span>
        </div>
      ) : (
        card.prontidao &&
        (card.prontidao.pronto ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 9, fontSize: 11.5, fontWeight: 600, color: PASTEL.green.dot, background: PASTEL.green.bg, borderRadius: 8, padding: "3px 9px" }}>
            <CheckCircle2 size={13} />
            Pronto para mover
          </div>
        ) : (
          <div title={card.prontidao.faltas.join("\n")} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 9, fontSize: 11.5, color: "#8a5a00", background: PASTEL.amber.bg, borderRadius: 8, padding: "4px 9px" }}>
            <AlertCircle size={13} color={PASTEL.amber.dot} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong style={{ fontWeight: 600 }}>Falta:</strong> {card.prontidao.faltas.map(resumirFalta).join(", ")}
            </span>
          </div>
        ))
      )}

      {(mostrarComite || dias !== null) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.soft}` }}>
          {mostrarComite && (
            <span
              title={atrasada ? "Data Comitê já passou" : "Data Comitê"}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: atrasada ? 600 : 500, color: atrasada ? C.red : diaComite ? C.text : C.faint }}
            >
              {atrasada ? <AlertTriangle size={12} /> : <CalendarDays size={12} color={cor.dot} />}
              {diaComite ? formatarChaveDia(diaComite) : "Sem Data Comitê"}
              {atrasada && <span style={{ fontSize: 10.5, background: "#FBE7E4", borderRadius: 999, padding: "0 7px" }}>Atrasada</span>}
            </span>
          )}
          {dias !== null && (
            <span
              title={`Aging: ${dias} dia(s) desde a Data Abertura Produto${agingVermelho ? " — acima de 30 dias" : ""}`}
              style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: agingVermelho ? 600 : 500, color: agingVermelho ? C.red : C.muted, fontVariantNumeric: "tabular-nums" }}
            >
              <Clock size={11} />
              {dias}d
            </span>
          )}
        </div>
      )}
    </article>
  );
}

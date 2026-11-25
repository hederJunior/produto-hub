"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Building2, CalendarDays, CheckCircle2, Clock, Eye, EyeOff, FileText, GitBranch, MoveRight, RefreshCw, UserRound, X } from "lucide-react";
import { useProduto } from "@/components/ProdutoContext";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import FluxoPoMoverDialog, { type RespostaMover } from "@/components/FluxoPoMoverDialog";
import { C, PASTEL, infoPrioridade } from "@/lib/kmm-theme";
import { formatarChaveDia } from "@/lib/datas";
import { urlPbiAzure } from "@/lib/fluxo-po-campos";
import {
  ETAPAS_FLUXO,
  agingEmAlerta,
  agingEmDias,
  agruparPorEtapa,
  ordenarCardsDoComite,
  chaveDia,
  contarPorEtapa,
  comiteAtrasado,
  destinosPossiveis,
  ehMeuItem,
  estaNaAreaRaiz,
  montarCards,
  resumirFalta,
  rotuloDaArea,
  rotuloDaEtapa,
  type CardFluxo,
  type EtapaFluxo,
} from "@/lib/fluxo-po";
import { checklistCompleto } from "@/lib/fluxo-po-checklist";

/** Onde o quadro guarda, na sessão do navegador, os filtros do usuário. */
const CHAVE_FILTROS = "fluxo-po:filtros:v1";

type Esteira = { valor: string; rotulo: string };
type Eu = { email: string | null; nome: string | null };
type Resposta = { cards: CardFluxo[]; esteiras: Esteira[]; avisos: string[]; /** Itens do checklist da 2.1 marcados, por PBI (a tag "Pronto para mover" da 2.1 exige todos). */ checklistComite?: Record<string, { feitos: number; total: number }>; podeMovimentar: boolean; permissao?: { pode: boolean; motivo: string | null }; eu: Eu; erro?: string };

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
@keyframes fp-giro{ to{ transform:rotate(360deg); } }
.fp-scroll::-webkit-scrollbar{ width:6px; height:8px; }
.fp-scroll::-webkit-scrollbar-thumb{ background:#DAD5CD; border-radius:6px; }
`;

/** Os 6 quadros do Upstream. Sem Triagem (feita pelo Atendimento em outra ferramenta). */
export default function FluxoPoUpstream() {
  const { produto } = useProduto();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Filtros: esteiras (VÁRIAS, pelo Area Path), "Meus itens" e "Somente bloqueados". Ficam guardados na sessão do navegador
  // (sessionStorage): quem abre o detalhe de um card e volta encontra o quadro com os mesmos filtros.
  const [esteirasSel, setEsteirasSel] = useState<string[]>([]);
  const [meusItens, setMeusItens] = useState(false);
  // Filtro de PBI (2026-11-25): um ou mais PBIs escolhidos pelo número ou pelo título; o quadro mostra só eles.
  const [pbisSel, setPbisSel] = useState<string[]>([]);
  const [somenteBloqueados, setSomenteBloqueados] = useState(false);
  // Coluna "1.1 Classificar" recolhida (2026-11-24): o quadro não mostra os cards dela, só o título, o total e o botão para mostrar de novo.
  const [ocultar11, setOcultar11] = useState(false);
  const [filtrosRestaurados, setFiltrosRestaurados] = useState(false);
  const [hoje] = useState(() => new Date());
  const [recarga, setRecarga] = useState(0);
  // Atualização (T19): atualizar sem esconder o quadro, hora da última carga e controle do "voltar para a tela".
  const [atualizando, setAtualizando] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const temDados = useRef(false);
  const ultimaCarga = useRef(0);
  // Mover cards (T15): card sendo arrastado, pedido aberto na confirmação e o aviso do último resultado.
  const [arrastando, setArrastando] = useState<CardFluxo | null>(null);
  const [pedido, setPedido] = useState<{ card: CardFluxo; destino: EtapaFluxo } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; titulo: string; linhas: string[] } | null>(null);

  // O fluxo existe só no KMM5 — com KMM4 selecionado não há o que carregar.
  const semFluxo = produto === "KMM4";

  useEffect(() => {
    if (semFluxo) {
      setCarregando(false);
      return;
    }
    let cancelado = false;
    // Primeira carga mostra "Carregando…"; as seguintes (botão Atualizar, voltar para a tela) mantêm o quadro visível.
    if (!temDados.current) setCarregando(true);
    setAtualizando(true);
    setErro(null);
    ultimaCarga.current = Date.now();
    fetch("/api/fluxo-po/upstream", { cache: "no-store" })
      .then((res) => res.json())
      .then((j: Resposta) => {
        if (cancelado) return;
        if (j.erro) {
          // Falhou: se já havia dados, NÃO troca o quadro por um vazio — avisa e mantém os da última atualização.
          if (temDados.current) {
            setErro(`${j.erro} Os cards mostrados são os da última atualização.`);
            return;
          }
          setErro(j.erro);
        } else {
          temDados.current = true;
          setAtualizadoEm(new Date());
        }
        setDados(j);
      })
      .catch(() => {
        if (cancelado) return;
        setErro(temDados.current ? "Não foi possível atualizar o quadro. Os cards mostrados são os da última atualização." : "Não foi possível carregar o quadro do Azure DevOps.");
      })
      .finally(() => {
        if (cancelado) return;
        setCarregando(false);
        setAtualizando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [semFluxo, recarga]);

  // Ao voltar para a tela (aba do navegador ou janela em foco) com dados de mais de 30 s, atualiza sozinho — menos no meio de um
  // movimento (confirmação aberta ou card sendo arrastado), para não trocar o quadro debaixo do usuário.
  useEffect(() => {
    if (semFluxo) return;
    const aoVoltar = () => {
      if (document.visibilityState !== "visible" || pedido || arrastando) return;
      if (Date.now() - ultimaCarga.current > 30_000) setRecarga((n) => n + 1);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [semFluxo, pedido, arrastando]);

  // Restaura os filtros da sessão (uma vez, ao montar) e depois grava a cada mudança. Tudo em try/catch: o armazenamento pode estar
  // bloqueado (aba anônima, política do navegador) e a tela precisa funcionar do mesmo jeito, só sem lembrar dos filtros.
  useEffect(() => {
    try {
      const guardado = JSON.parse(window.sessionStorage.getItem(CHAVE_FILTROS) ?? "null") as { esteiras?: unknown; pbis?: unknown; meusItens?: unknown; somenteBloqueados?: unknown; ocultar11?: unknown } | null;
      if (guardado && typeof guardado === "object") {
        if (Array.isArray(guardado.esteiras)) setEsteirasSel(guardado.esteiras.filter((v): v is string => typeof v === "string"));
        if (Array.isArray(guardado.pbis)) setPbisSel(guardado.pbis.filter((v): v is string => typeof v === "string"));
        setMeusItens(guardado.meusItens === true);
        setSomenteBloqueados(guardado.somenteBloqueados === true);
        setOcultar11(guardado.ocultar11 === true);
      }
    } catch {
      /* sem armazenamento: segue sem lembrar */
    }
    setFiltrosRestaurados(true);
  }, []);
  useEffect(() => {
    if (!filtrosRestaurados) return; // não sobrescreve o guardado com os valores iniciais antes de restaurar
    try {
      window.sessionStorage.setItem(CHAVE_FILTROS, JSON.stringify({ esteiras: esteirasSel, pbis: pbisSel, meusItens, somenteBloqueados, ocultar11 }));
    } catch {
      /* idem */
    }
  }, [filtrosRestaurados, esteirasSel, pbisSel, meusItens, somenteBloqueados, ocultar11]);
  // Esteira guardada que já não existe no Azure sai do filtro (senão o quadro ficaria só com os cards sem esteira).
  useEffect(() => {
    const existentes = dados?.esteiras ?? [];
    if (!existentes.length) return;
    setEsteirasSel((sel) => (sel.every((v) => existentes.some((e) => e.valor === v)) ? sel : sel.filter((v) => existentes.some((e) => e.valor === v))));
  }, [dados?.esteiras]);

  const cards = dados?.cards ?? [];
  // PBI guardado que já não está no quadro (movido de etapa fora do fluxo, concluído…) sai do filtro, senão o quadro ficaria vazio sem explicação.
  useEffect(() => {
    if (!dados?.cards.length) return;
    const ids = new Set(dados.cards.map((c) => String(c.pbi.id)));
    setPbisSel((sel) => (sel.every((v) => ids.has(v)) ? sel : sel.filter((v) => ids.has(v))));
  }, [dados?.cards]);
  const podeMover = !!dados?.podeMovimentar;

  function abrirMover(card: CardFluxo, destino: EtapaFluxo) {
    setAviso(null);
    setPedido({ card, destino });
  }

  /** Soltou o card numa coluna: se o destino é possível a partir da etapa dele, abre a confirmação (que mostra a regra). */
  function aoSoltar(destino: EtapaFluxo) {
    const card = arrastando;
    setArrastando(null);
    if (!card || card.etapa === destino) return;
    if (!destinosPossiveis(card.etapa).some((d) => d.destino === destino)) {
      const lista = destinosPossiveis(card.etapa).map((d) => rotuloDaEtapa(d.destino)).join(" ou ");
      setAviso({ tipo: "erro", titulo: "Movimento não permitido", linhas: [`De ${rotuloDaEtapa(card.etapa)} o card só pode ir para ${lista || "nenhuma etapa"}.`] });
      return;
    }
    abrirMover(card, destino);
  }

  /** Movimento gravado: troca o card pelo devolvido pelo servidor (recalcula coluna e ordem) e mostra o resultado. */
  function aoConcluir(r: RespostaMover) {
    const id = pedido?.card.pbi.id;
    setPedido(null);
    if (id === undefined) return;
    setDados((d) => {
      if (!d) return d;
      const pbis = d.cards.filter((c) => c.pbi.id !== id).map((c) => c.pbi);
      if (r.card) pbis.push(r.card.pbi);
      return { ...d, cards: montarCards(pbis) };
    });
    // Card que chegou à 2.1: o checklist dele (que pode já ter marcações) vem do servidor; recarrega o quadro.
    if (r.destino === "2.1") setRecarga((n) => n + 1);
    const linhas: string[] = [];
    if (r.comentario.publicado) linhas.push("Comentário de transição registrado no PBI.");
    if (r.assesments && r.assesments.atualizados.length + r.assesments.jaIguais.length > 0) {
      linhas.push(`Data Comitê copiada para ${r.assesments.atualizados.length + r.assesments.jaIguais.length} Assesment(s) filho(s).`);
    }
    setAviso({
      tipo: "ok",
      titulo: `#${id} movido${r.origem ? `: ${rotuloDaEtapa(r.origem)} → ${rotuloDaEtapa(r.destino)}` : ` para ${rotuloDaEtapa(r.destino)}`}`,
      linhas: [...linhas, ...r.avisos],
    });
  }

  /** O PBI mudou no Azure DevOps (409): fecha a confirmação e recarrega o quadro. */
  function aoConflitar() {
    setPedido(null);
    setAviso({ tipo: "erro", titulo: "O PBI foi alterado por outra pessoa", linhas: ["O quadro foi atualizado com os dados mais recentes do Azure DevOps. Confira o card e tente de novo."] });
    setRecarga((n) => n + 1);
  }
  const eu: Eu = dados?.eu ?? { email: null, nome: null };

  // Esteiras escolhidas (uma ou mais) + os cards da raiz KMM5 (etapa 1.1, ainda sem esteira, são de quem vai classificar para qualquer uma).
  const visiveisSemPbi = useMemo(
    () =>
      cards.filter((c) => {
        const area = c.pbi.areaPath;
        if (esteirasSel.length && !(estaNaAreaRaiz(area) || esteirasSel.some((e) => area === e || area.startsWith(`${e}\\`)))) return false;
        if (meusItens && !ehMeuItem(c.pbi, eu)) return false;
        return true;
      }),
    [cards, esteirasSel, meusItens, eu.email, eu.nome] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Opções do filtro de PBI: os cards que passam pelos outros filtros (esteira e meus itens), do número maior para o menor, mais os já escolhidos.
  const opcoesPbi = useMemo(() => {
    const ids = new Set(visiveisSemPbi.map((c) => String(c.pbi.id)));
    pbisSel.forEach((v) => ids.add(v));
    return Array.from(ids).sort((a, b) => Number(b) - Number(a));
  }, [visiveisSemPbi, pbisSel]);
  const tituloDoPbi = useMemo(() => new Map(cards.map((c) => [String(c.pbi.id), c.pbi.titulo])), [cards]);
  const rotuloDoPbi = (v: string) => {
    const t = (tituloDoPbi.get(v) ?? "").trim();
    return t ? `#${v} — ${t.length > 55 ? `${t.slice(0, 54)}…` : t}` : `#${v}`;
  };
  const visiveis = useMemo(() => (pbisSel.length ? visiveisSemPbi.filter((c) => pbisSel.includes(String(c.pbi.id))) : visiveisSemPbi), [visiveisSemPbi, pbisSel]);

  // Contadores por coluna (prontos e bloqueados): sobre os cards dos filtros de esteira e meus itens. O filtro
  // "Somente bloqueados" não os zera, senão o número de prontos sumiria justamente quando ele está ligado.
  // Na 2.1 "pronto" = regra cumprida E checklist inteiro marcado (o mesmo critério da tag do card).
  const checklistComite = dados?.checklistComite;
  const checklistDoCardCompleto = (id: number) => checklistCompleto(checklistComite?.[String(id)]);
  const contadores = useMemo(() => {
    const c = contarPorEtapa(visiveis.map((x) => x.pbi));
    c["2.1"].prontos = visiveis.filter((x) => x.etapa === "2.1" && x.prontidao?.pronto && checklistCompleto(checklistComite?.[String(x.pbi.id)])).length;
    return c;
  }, [visiveis, checklistComite]);
  const totalBloqueados = ETAPAS_FLUXO.reduce((soma, e) => soma + contadores[e.codigo].bloqueados, 0);

  // "Somente bloqueados": cards de etapas com movimento que ainda não cumprem a regra (inclui os inconsistentes).
  const exibidos = useMemo(() => (somenteBloqueados ? visiveis.filter((c) => c.prontidao && !c.prontidao.pronto) : visiveis), [visiveis, somenteBloqueados]);

  const porEtapa = useMemo(() => {
    const por = agruparPorEtapa(exibidos);
    // Comitê: sem Data Comitê no topo; depois da Data Comitê mais antiga para a mais nova.
    por["2.1"] = ordenarCardsDoComite(por["2.1"]);
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
          <MultiSelectFiltro
            rotuloTodos="Todas as esteiras"
            opcoes={(dados?.esteiras ?? []).map((e) => e.rotulo)}
            selecionados={esteirasSel.map((v) => rotuloDaEsteira(dados, v))}
            onChange={(rotulos) => setEsteirasSel(rotulos.map((r) => dados?.esteiras.find((e) => e.rotulo === r)?.valor ?? r))}
            pesquisavel
            placeholderBusca="Digite o nome da esteira…"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>PBI</span>
          <MultiSelectFiltro
            rotuloTodos="Todos os PBIs"
            opcoes={opcoesPbi}
            selecionados={pbisSel}
            onChange={setPbisSel}
            formatar={rotuloDoPbi}
            pesquisavel
            placeholderBusca="Digite o número ou o título do PBI…"
          />
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
        <button
          type="button"
          className="kmm-btn"
          onClick={() => setRecarga((n) => n + 1)}
          disabled={atualizando}
          title="Buscar agora os dados mais recentes do Azure DevOps"
          aria-label="Atualizar o quadro"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={14} style={atualizando ? { animation: "fp-giro 1s linear infinite" } : undefined} />
          {atualizando ? "Atualizando…" : "Atualizar"}
        </button>
        {!carregando && !erro && (
          <span style={{ fontSize: 12, color: C.muted }}>
            {exibidos.length} {exibidos.length === 1 ? "demanda" : "demandas"}
            {esteirasSel.length ? ` em ${esteirasSel.length === 1 ? rotuloDaEsteira(dados, esteirasSel[0]) : `${esteirasSel.length} esteiras`} (mais os cards sem esteira)` : ""}
            {meusItens ? " suas" : ""}
            {pbisSel.length ? ` (${pbisSel.length === 1 ? "1 PBI escolhido" : `${pbisSel.length} PBIs escolhidos`})` : ""}
          </span>
        )}
        {atualizadoEm && (
          <span title="O quadro também se atualiza sozinho ao voltar para esta tela" style={{ fontSize: 12, color: C.faint }}>
            Atualizado às {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
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

      {aviso && (
        <div
          role="status"
          className="kmm-card"
          style={{ marginBottom: 12, fontSize: 13, display: "flex", alignItems: "flex-start", gap: 10, background: aviso.tipo === "ok" ? PASTEL.green.bg : "#FDF1F0", color: C.text, borderColor: aviso.tipo === "ok" ? "#CFE9D8" : "#F3C9C4" }}
        >
          {aviso.tipo === "ok" ? <CheckCircle2 size={16} color={PASTEL.green.dot} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />}
          <div>
            <div style={{ fontWeight: 600 }}>{aviso.titulo}</div>
            {aviso.linhas.map((l) => (
              <div key={l} style={{ marginTop: 3, color: C.muted }}>{l}</div>
            ))}
          </div>
          <button type="button" aria-label="Fechar aviso" onClick={() => setAviso(null)} style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: C.muted, padding: 2 }}>
            <X size={15} />
          </button>
        </div>
      )}
      {erro && <div className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: C.red }}>{erro}</div>}
      {(dados?.avisos ?? []).map((a) => (
        <div key={a} className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: "#8a5a00", background: "#fff6e0" }}>{a}</div>
      ))}

      {carregando ? (
        <p style={{ color: C.muted }}>Carregando demandas do Azure DevOps…</p>
      ) : (
        <div className="fp-scroll" style={{ overflowX: "auto", paddingBottom: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: ocultar11 ? "96px repeat(5, minmax(250px, 1fr))" : "repeat(6, minmax(250px, 1fr))", gap: 14, minWidth: ocultar11 ? 1466 : 1620, alignItems: "start" }}>
            {ETAPAS_FLUXO.map((etapa) => {
              const lista = porEtapa[etapa.codigo];
              const cor = COR_DA_ETAPA[etapa.codigo];
              // Enquanto um card é arrastado: as colunas para onde ele pode ir se destacam; as demais esmaecem.
              const alvoValido = !!arrastando && destinosPossiveis(arrastando.etapa).some((d) => d.destino === etapa.codigo);
              return (
                <section
                  key={etapa.codigo}
                  aria-label={`${etapa.codigo} ${etapa.nome}`}
                  onDragOver={(e) => {
                    if (!alvoValido) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    if (!alvoValido) return;
                    e.preventDefault();
                    aoSoltar(etapa.codigo);
                  }}
                  style={{
                    background: alvoValido ? cor.bg : C.soft,
                    borderRadius: 16,
                    borderTop: `3px solid ${cor.dot}`,
                    padding: etapa.codigo === "1.1" && ocultar11 ? "12px 6px 10px" : "12px 10px 10px",
                    outline: alvoValido ? `2px dashed ${cor.dot}` : "none",
                    opacity: arrastando && !alvoValido && arrastando.etapa !== etapa.codigo ? 0.55 : 1,
                    transition: "opacity .15s ease, background .15s ease",
                  }}
                >
                  {etapa.codigo === "1.1" && ocultar11 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => setOcultar11(false)}
                        title="Mostrar os cards da coluna 1.1 Classificar"
                        aria-label="Mostrar os cards da coluna 1.1 Classificar"
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 30, borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", cursor: "pointer", color: C.text }}
                      >
                        <Eye size={15} />
                      </button>
                      <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 12.5, color: C.text, lineHeight: 1.25 }}>
                        <span style={{ color: cor.dot }}>{etapa.codigo}</span>
                        <div style={{ fontSize: 11.5 }}>{etapa.nome}</div>
                      </div>
                      <span title={`${lista.length} ${lista.length === 1 ? "demanda oculta" : "demandas ocultas"}`} style={{ fontSize: 12, fontWeight: 600, color: C.muted, background: "#fff", borderRadius: 999, padding: "1px 9px", fontVariantNumeric: "tabular-nums" }}>
                        {lista.length}
                      </span>
                      <span style={{ fontSize: 10.5, color: C.faint }}>cards ocultos</span>
                    </div>
                  ) : (
                  <>
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
                    {etapa.codigo === "1.1" && (
                      <button
                        type="button"
                        onClick={() => setOcultar11(true)}
                        title="Ocultar os cards desta coluna (1.1 Classificar)"
                        aria-label="Ocultar os cards da coluna 1.1 Classificar"
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 26, borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", cursor: "pointer", color: C.muted }}
                      >
                        <EyeOff size={14} />
                      </button>
                    )}
                  </header>
                  <div className="fp-scroll" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "62vh", overflowY: "auto", paddingRight: 2 }}>
                    {lista.length === 0 ? (
                      <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "22px 12px", textAlign: "center", fontSize: 12.5, color: C.faint }}>Sem demandas</div>
                    ) : (
                      lista.map((c) => (
                        <CardEsteira
                          key={c.pbi.id}
                          card={c}
                          checklistCompleto={checklistDoCardCompleto(c.pbi.id)}
                          cor={cor}
                          hoje={hoje}
                          podeMover={podeMover}
                          aoMover={(destino) => abrirMover(c, destino)}
                          aoIniciarArrasto={() => setArrastando(c)}
                          aoFimArrasto={() => setArrastando(null)}
                        />
                      ))
                    )}
                  </div>
                  </>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {pedido && (
        <FluxoPoMoverDialog
          key={pedido.card.pbi.id}
          card={pedido.card}
          destinoInicial={pedido.destino}
          onFechar={() => setPedido(null)}
          onConcluido={aoConcluir}
          onConflito={aoConflitar}
        />
      )}
    </div>
  );
}

function rotuloDaEsteira(dados: Resposta | null, valor: string): string {
  return dados?.esteiras.find((e) => e.valor === valor)?.rotulo ?? valor;
}

/**
 * Card da esteira, com os campos de cada coluna (docs/fluxo-po-decisoes.md §5):
 * 1.1 número, título, aging e cliente · 1.2 + Area Path e prioridade · 2.1 número, título, Area Path, Data Comitê
 * (com indicativo de atraso), cliente e prioridade · 3.1, 3.2 e 4.1 número, título, Area Path, cliente e prioridade.
 */
function CardEsteira({
  card,
  checklistCompleto: checklistInteiro,
  cor,
  hoje,
  podeMover,
  aoMover,
  aoIniciarArrasto,
  aoFimArrasto,
}: {
  card: CardFluxo;
  /** Todos os itens do checklist da 2.1 marcados (só usado na coluna 2.1). */
  checklistCompleto: boolean;
  cor: { bg: string; dot: string };
  hoje: Date;
  podeMover: boolean;
  aoMover: (destino: EtapaFluxo) => void;
  aoIniciarArrasto: () => void;
  aoFimArrasto: () => void;
}) {
  const { pbi, etapa } = card;
  const [menuAberto, setMenuAberto] = useState(false);
  // Só os cards das etapas com movimento (1.1, 1.2, 2.1) e só para quem pode movimentar.
  const movel = podeMover && !!card.prontidao;
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
      draggable={movel}
      onDragStart={(e) => {
        if (!movel) return;
        e.dataTransfer.setData("text/plain", String(pbi.id));
        e.dataTransfer.effectAllowed = "move";
        aoIniciarArrasto();
      }}
      onDragEnd={aoFimArrasto}
      style={{
        background: card.inconsistencia ? "#FFF8F7" : "#fff",
        border: card.inconsistencia ? `1.5px solid ${C.red}` : `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "11px 12px 10px",
        cursor: movel ? "grab" : "default",
      }}
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

      {etapa !== "1.1" && (
        <div title={pbi.po ? `PO: ${pbi.po}` : "Sem PO no PBI"} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11.5, color: pbi.po ? C.muted : C.faint }}>
          <UserRound size={12} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>PO: {pbi.po || "sem PO"}</span>
        </div>
      )}

      {card.inconsistencia ? (
        <div role="alert" title={card.inconsistencia} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 9, fontSize: 11.5, fontWeight: 600, color: C.red, background: "#FBE7E4", borderRadius: 8, padding: "5px 8px" }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Inconsistente: {card.inconsistencia}</span>
        </div>
      ) : (
        card.prontidao &&
        (card.prontidao.pronto ? (
          // Na 2.1 a tag só aparece com TODOS os itens do checklist marcados (pedido do Heder, 2026-11-24); sem isso, nada é mostrado.
          etapa === "2.1" && !checklistInteiro ? null : <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 9, fontSize: 11.5, fontWeight: 600, color: PASTEL.green.dot, background: PASTEL.green.bg, borderRadius: 8, padding: "3px 9px" }}>
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
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
        <Link
          href={`/fluxo-po/${pbi.id}`}
          draggable={false}
          className="kmm-btn"
          title="Abrir o detalhe do card (informações, etapas e prontidão)"
          style={{ fontSize: 12, padding: "4px 10px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, color: C.text }}
        >
          <FileText size={13} />
          Detalhes
        </Link>
        {movel && (
          <button
            type="button"
            className="kmm-btn"
            aria-haspopup="menu"
            aria-expanded={menuAberto}
            onClick={() => setMenuAberto((v) => !v)}
            style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <MoveRight size={13} />
            Mover
          </button>
        )}
        {movel && menuAberto && (
            <div role="menu" style={{ position: "absolute", left: 0, top: "100%", marginTop: 4, zIndex: 5, minWidth: 240, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(30,27,24,.14)", padding: 4 }}>
              {destinosPossiveis(etapa).map((d) => (
                <button
                  key={d.destino}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuAberto(false);
                    aoMover(d.destino);
                  }}
                  style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, color: C.text, padding: "7px 10px", borderRadius: 8 }}
                >
                  <span style={{ fontWeight: 600 }}>{d.direcao === "volta" ? "Voltar para" : "Avançar para"}</span>
                  {rotuloDaEtapa(d.destino)}
                </button>
              ))}
            </div>
          )}
      </div>
    </article>
  );
}

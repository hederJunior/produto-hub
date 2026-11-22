"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, Loader2, X } from "lucide-react";
import { CampoInformacao, type Campo, type Listas } from "@/components/FluxoPoCampo";
import { C, PASTEL } from "@/lib/kmm-theme";
import { urlPbiAzure } from "@/lib/fluxo-po-campos";
import {
  avaliarMovimento,
  camposParaMover,
  destinosPossiveis,
  resumirFalta,
  rotuloDaEtapa,
  valorLegivelDaAlteracao,
  type Alteracao,
  type CardFluxo,
  type EtapaFluxo,
  type ResultadoReplicacao,
} from "@/lib/fluxo-po";

/** Resposta de `POST /api/fluxo-po/mover` em caso de sucesso (espelha ResultadoMover, que vive no código de servidor). */
export type RespostaMover = {
  origem: EtapaFluxo | null;
  destino: EtapaFluxo;
  direcao: "avanco" | "volta" | null;
  proposta: boolean;
  alteracoes: Alteracao[];
  card: CardFluxo | null;
  assesments: ResultadoReplicacao | null;
  comentario: { publicado: boolean; id?: number; erro?: string };
  avisos: string[];
};

type ErroMover = { mensagem: string; faltas: string[]; conflito: boolean };

/**
 * Confirmação do movimento de um card. Mostra o destino (com a escolha 3.1 ou 3.2 quando vem da 2.1, e a volta), o que
 * será gravado no PBI ("Ao avançar, grava no PBI") ou, se a regra não é cumprida, o motivo — o card nunca sai do lugar
 * e nada é gravado. A regra é avaliada aqui só para orientar; o SERVIDOR revalida tudo antes de gravar.
 */
export default function FluxoPoMoverDialog({
  card,
  destinoInicial,
  onFechar,
  onConcluido,
  onConflito,
}: {
  card: CardFluxo;
  destinoInicial: EtapaFluxo;
  onFechar: () => void;
  onConcluido: (r: RespostaMover) => void;
  /** O PBI mudou no Azure DevOps desde que o quadro foi lido (HTTP 409): a tela recarrega o quadro. */
  onConflito: () => void;
}) {
  const [destino, setDestino] = useState<EtapaFluxo>(destinoInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroMover | null>(null);
  // Campos que o card ainda não tem e o movimento exige: o usuário preenche aqui mesmo (o servidor grava junto com o movimento).
  const [preenchidos, setPreenchidos] = useState<Partial<Record<Campo, string>>>({});
  const [listas, setListas] = useState<Listas | null>(null);
  const [erroListas, setErroListas] = useState(false);

  const opcoes = useMemo(() => destinosPossiveis(card.etapa), [card.etapa]);
  const campos = useMemo(() => camposParaMover(card.pbi, destino) as Campo[], [card.pbi, destino]);
  // Só vai ao servidor o que foi realmente preenchido; as listas do Azure conferem Classificação e Cliente aqui e lá.
  const entrada = useMemo(() => {
    const e: Partial<Record<Campo, string>> = {};
    for (const c of campos) if ((preenchidos[c] ?? "").trim() !== "") e[c] = (preenchidos[c] ?? "").trim();
    return e;
  }, [campos, preenchidos]);
  const av = useMemo(
    () => avaliarMovimento(card.pbi, destino, entrada, listas ? { classificacoes: listas.classificacoes, clientes: listas.clientes } : {}),
    [card.pbi, destino, entrada, listas],
  );

  // As listas do Azure só são buscadas quando há o que preencher (e uma vez só).
  useEffect(() => {
    if (!campos.length || listas || erroListas) return;
    let cancelado = false;
    fetch("/api/fluxo-po/listas", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((j: Listas) => !cancelado && setListas(j))
      .catch(() => !cancelado && setErroListas(true));
    return () => {
      cancelado = true;
    };
  }, [campos.length, listas, erroListas]);
  const volta = av.direcao === "volta";

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => e.key === "Escape" && !enviando && onFechar();
    window.addEventListener("keydown", teclas);
    return () => window.removeEventListener("keydown", teclas);
  }, [enviando, onFechar]);

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/fluxo-po/mover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.pbi.id, destino, ...(Object.keys(entrada).length ? { entrada } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        onConcluido(j as RespostaMover);
        return;
      }
      setErro({ mensagem: j.erro ?? "Não foi possível mover o card.", faltas: j.faltas ?? [], conflito: res.status === 409 });
    } catch {
      setErro({ mensagem: "Não foi possível falar com o servidor. Nada foi confirmado; tente de novo.", faltas: [], conflito: false });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && !enviando && onFechar()}
      style={{ position: "fixed", inset: 0, background: "rgba(30,27,24,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar movimento do card"
        style={{ background: "#fff", borderRadius: 16, width: "min(580px, 100%)", maxHeight: "90vh", overflowY: "auto", overflowX: "hidden", boxShadow: "0 20px 60px rgba(30,27,24,.28)", padding: "20px 22px" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 700, fontSize: 17, color: C.text }}>Mover card</div>
            <div style={{ marginTop: 4, fontSize: 13, color: C.muted, lineHeight: 1.4 }}>
              <a href={urlPbiAzure(card.pbi.id)} target="_blank" rel="noopener noreferrer" style={{ color: C.muted, fontWeight: 600 }}>
                #{card.pbi.id}
              </a>{" "}
              {card.pbi.titulo}
            </div>
          </div>
          <button type="button" aria-label="Fechar" onClick={onFechar} disabled={enviando} style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: C.muted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* De → para; com mais de um destino possível (2.1 → 3.1 ou 3.2, ou a volta) a escolha fica aqui. */}
        <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".03em" }}>
          De {rotuloDaEtapa(card.etapa)} para
        </div>
        <div role="radiogroup" aria-label="Etapa de destino" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {opcoes.map((o) => {
            const marcado = o.destino === destino;
            return (
              <label
                key={o.destino}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, cursor: enviando ? "default" : "pointer", border: `1.5px solid ${marcado ? C.orange : C.border}`, background: marcado ? "#FFF8F4" : "#fff" }}
              >
                <input type="radio" name="destino-fluxo-po" checked={marcado} disabled={enviando} onChange={() => { setDestino(o.destino); setErro(null); }} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
                  {o.direcao === "volta" ? "Voltar para " : ""}
                  {rotuloDaEtapa(o.destino)}
                </span>
                {o.direcao === "volta" && (
                  <span title="O que a volta grava ainda está em validação" style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: "1px 8px", background: PASTEL.amber.bg, color: PASTEL.amber.dot }}>
                    proposta
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {campos.length > 0 && (
          <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: "#FCFBF9" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Falta preencher para mover</div>
            <div style={{ fontSize: 12, color: C.muted, margin: "2px 0 10px" }}>
              Preencha aqui: os valores são gravados no PBI junto com o movimento (listas do Azure DevOps).
            </div>
            {erroListas && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 8 }}>Não foi possível carregar as listas do Azure DevOps. Feche e tente de novo.</div>}
            {!listas && !erroListas ? (
              <div style={{ fontSize: 12.5, color: C.muted }}>Carregando as listas do Azure DevOps…</div>
            ) : listas ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
                {campos.map((c) => (
                  <CampoInformacao
                    key={c}
                    campo={c}
                    valor={preenchidos[c] ?? ""}
                    original=""
                    editavel={!enviando}
                    listas={listas}
                    semRaiz
                    marcarAlterado={false}
                    aoMudar={(v) => {
                      setPreenchidos((p) => ({ ...p, [c]: v }));
                      setErro(null);
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}

        {av.permitido ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: PASTEL.green.dot }}>
              <CheckCircle2 size={15} />
              {volta ? "Ao voltar, grava no PBI" : "Ao avançar, grava no PBI"}
            </div>
            <div style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              {av.alteracoes.map((a, i) => (
                <div key={a.campo} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "8px 12px", fontSize: 13, borderTop: i ? `1px solid ${C.soft}` : "none" }}>
                  <span style={{ minWidth: 118, fontWeight: 600, color: C.text }}>{a.rotulo}</span>
                  <span style={{ color: C.muted }}>{valorLegivelDaAlteracao(a.campo, a.de)}</span>
                  <ArrowRight size={13} color={C.faint} />
                  <span style={{ color: C.text, fontWeight: 600 }}>{valorLegivelDaAlteracao(a.campo, a.para)}</span>
                </div>
              ))}
              {av.alteracoes.length === 0 && <div style={{ padding: "8px 12px", fontSize: 13, color: C.muted }}>Nenhum campo do PBI muda neste movimento.</div>}
            </div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>
              <li>O Status continua Backlog e o card passa a aparecer em {rotuloDaEtapa(destino)}.</li>
              <li>O sistema publica um comentário no PBI com origem, destino, usuário e data, e registra o movimento no log.</li>
              {av.replicarDataComiteAssesments && <li>A Data Comitê é copiada para todos os Assesments filhos do PBI (sem filho, o sistema avisa e segue).</li>}
            </ul>
            {av.avisos.map((a) => (
              <div key={a} style={{ marginTop: 10, fontSize: 12.5, color: "#8a5a00", background: "#fff6e0", borderRadius: 8, padding: "7px 10px" }}>{a}</div>
            ))}
          </div>
        ) : (
          <div role="alert" style={{ marginTop: 16, background: "#FDF1F0", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: C.red }}>
              <AlertTriangle size={15} />
              Ainda não dá para mover este card
            </div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: C.text, lineHeight: 1.55 }}>
              {av.faltas.map((f) => (
                <li key={f} title={f}>
                  {f}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 10, fontSize: 12.5, color: C.muted }}>
              Nada foi gravado e o card continua em {rotuloDaEtapa(card.etapa)}.{" "}
              {campos.length > 0 ? (
                <>Preencha o que falta acima para poder mover.</>
              ) : (
                <>
                  Complete{av.faltas.length > 1 ? " os campos" : " o campo"} ({av.faltas.map(resumirFalta).join(", ")}) no PBI{" "}
                  <a href={urlPbiAzure(card.pbi.id)} target="_blank" rel="noopener noreferrer" style={{ color: C.orange, fontWeight: 600 }}>
                    no Azure DevOps <ExternalLink size={11} style={{ verticalAlign: -1 }} />
                  </a>{" "}
                  e atualize o quadro.
                </>
              )}
            </div>
          </div>
        )}

        {erro && (
          <div role="alert" style={{ marginTop: 14, background: "#FDF1F0", color: C.red, borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{erro.mensagem}</div>
            {erro.faltas.length > 0 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: C.text }}>
                {erro.faltas.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            {erro.conflito && (
              <button type="button" className="kmm-btn" style={{ marginTop: 8 }} onClick={onConflito}>
                Atualizar o quadro
              </button>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" className="kmm-btn" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="button"
            className="kmm-btn"
            onClick={confirmar}
            disabled={!av.permitido || enviando}
            style={{ background: av.permitido ? C.orange : C.soft, color: av.permitido ? "#fff" : C.faint, borderColor: av.permitido ? C.orange : C.border, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7, cursor: av.permitido && !enviando ? "pointer" : "not-allowed" }}
          >
            {enviando && <Loader2 size={14} style={{ animation: "kmm-giro 1s linear infinite" }} />}
            {enviando ? "Gravando…" : volta ? "Confirmar e voltar" : "Confirmar e gravar"}
          </button>
        </div>
        <style>{"@keyframes kmm-giro{to{transform:rotate(360deg)}}"}</style>
      </div>
    </div>
  );
}

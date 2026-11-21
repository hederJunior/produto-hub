"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Check, ExternalLink, Loader2, Paperclip, Send, Sparkles } from "lucide-react";
import { C, PASTEL } from "@/lib/kmm-theme";
import { AO_AVANCAR, LIMITE_COMENTARIO, QUANDO_AVANCA, rotuloDaEtapa, valorLegivelDaAlteracao, type EtapaFluxo } from "@/lib/fluxo-po";
import type { ChecklistPbi, ItemChecklistEstado } from "@/lib/fluxo-po-checklist";
import type { AnexoPbi, EntradaHistorico, MovimentoPbi } from "@/lib/fluxo-po-detalhe";

type AbaEtapa = "1.1" | "1.2" | "2.1";
type Comentario = { id: number; autor: string; quando: string | null; editadoEm: string | null; html: string };

/** "20/11/2026 15:30" no fuso de Brasília. */
function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d).replace(",", "");
}

function tamanho(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** GET de uma parte do detalhe; cada bloco carrega sozinho (a falha de um não derruba os outros). */
function useCarga<T>(url: string, dependencias: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (cancelado) return;
        if (!res.ok) {
          setErro(j.erro ?? "Não foi possível carregar.");
          setDados(null);
        } else {
          setErro(null);
          setDados(j as T);
        }
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, n, ...dependencias]);
  return { dados, erro, carregando, recarregar: useCallback(() => setN((x) => x + 1), []), setDados };
}

function Bloco({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="kmm-card" style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 14.5, color: C.text }}>{titulo}</h2>
        {extra && <div style={{ marginLeft: "auto" }}>{extra}</div>}
      </div>
      {children}
    </section>
  );
}

const Carregando = () => <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Carregando…</p>;
const Erro = ({ texto }: { texto: string }) => <p style={{ margin: 0, fontSize: 13, color: C.red }}>{texto}</p>;
const Vazio = ({ texto }: { texto: string }) => <p style={{ margin: 0, fontSize: 13, color: C.faint }}>{texto}</p>;

// Estilo do HTML do Azure já sanitizado (descrição e comentários).
const ESTILO_HTML = `
.fp-html{ font-size:13.5px; line-height:1.5; color:${C.text}; overflow-wrap:anywhere; }
.fp-html p{ margin:0 0 8px; } .fp-html ul,.fp-html ol{ margin:0 0 8px; padding-left:20px; }
.fp-html table{ border-collapse:collapse; margin:6px 0; } .fp-html td,.fp-html th{ border:1px solid ${C.border}; padding:3px 7px; }
.fp-html a{ color:${C.orange}; } .fp-html blockquote{ margin:6px 0; padding-left:10px; border-left:3px solid ${C.border}; color:${C.muted}; }
.fp-html pre{ background:${C.soft}; padding:8px; border-radius:8px; overflow:auto; }
`;

/**
 * Blocos do detalhe do card (T17): checklist da etapa, descrição (com o botão do Agente de Classificação na 1.1), comentários,
 * anexos, histórico do PBI e dos movimentos, e os quadros "Quando avança" e "Ao avançar, grava no PBI". Cada um lê sua parte
 * do servidor (T08/T10) sozinho. Escrever (checklist, comentário) exige poder movimentar; o servidor confere.
 */
export default function FluxoPoDetalheBlocos({ id, aba, pode, motivoSemPermissao, versao, aoPublicarComentario }: { id: number; aba: AbaEtapa; pode: boolean; motivoSemPermissao: string | null; versao: number | undefined; aoPublicarComentario?: () => void }) {
  return (
    <div style={{ marginTop: 14 }}>
      <style>{ESTILO_HTML}</style>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Checklist id={id} aba={aba} pode={pode} motivoSemPermissao={motivoSemPermissao} />
          <Descricao id={id} aba={aba} />
          <Comentarios id={id} pode={pode} motivoSemPermissao={motivoSemPermissao} aoPublicar={aoPublicarComentario} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <QuandoAvanca aba={aba} />
          <AoAvancar aba={aba} />
          <Anexos id={id} />
          <Historico id={id} versao={versao} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function Checklist({ id, aba, pode, motivoSemPermissao }: { id: number; aba: AbaEtapa; pode: boolean; motivoSemPermissao: string | null }) {
  const { dados, erro, carregando, setDados } = useCarga<{ checklist: ChecklistPbi }>(`/api/fluxo-po/pbi/${id}/checklist`);
  const [falha, setFalha] = useState<string | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);
  const itens = dados?.checklist[aba] ?? [];
  const feitos = itens.filter((i) => i.marcado).length;

  function trocar(etapa: AbaEtapa, itemId: string, depois: ItemChecklistEstado) {
    setDados((d) => (d ? { checklist: { ...d.checklist, [etapa]: (d.checklist[etapa] ?? []).map((i) => (i.id === itemId ? depois : i)) } } : d));
  }

  async function marcar(item: ItemChecklistEstado) {
    if (!pode || gravando) return;
    setFalha(null);
    setGravando(item.id);
    const antes = item;
    trocar(aba, item.id, { ...item, marcado: !item.marcado }); // otimista; volta se o servidor recusar
    try {
      const res = await fetch(`/api/fluxo-po/pbi/${id}/checklist`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etapa: aba, itemId: item.id, marcado: !item.marcado }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        trocar(aba, item.id, antes);
        setFalha(j.erro ?? "Não foi possível gravar o checklist.");
      } else {
        trocar(aba, item.id, j.item as ItemChecklistEstado);
      }
    } catch {
      trocar(aba, item.id, antes);
      setFalha("Não foi possível falar com o servidor. O item não foi alterado.");
    } finally {
      setGravando(null);
    }
  }

  return (
    <Bloco titulo="Checklist da etapa" extra={itens.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: feitos === itens.length ? PASTEL.green.dot : C.muted }}>{feitos} de {itens.length}</span>}>
      {carregando && !dados ? (
        <Carregando />
      ) : erro ? (
        <Erro texto={erro} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {itens.map((i) => (
            <label
              key={i.id}
              title={pode ? "" : (motivoSemPermissao ?? "Somente visualização")}
              style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1px solid ${i.marcado ? "#CFE9D8" : C.border}`, background: i.marcado ? PASTEL.green.bg : "#fff", cursor: pode ? "pointer" : "default" }}
            >
              <input type="checkbox" checked={i.marcado} disabled={!pode || gravando !== null} onChange={() => marcar(i)} style={{ marginTop: 3 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, color: C.text, }}>{i.rotulo}</span>
                {i.marcado && (
                  <span style={{ display: "block", fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                    Marcado por {i.marcadoPor ?? "—"} em {dataHora(i.marcadoEm)}
                  </span>
                )}
              </span>
              {gravando === i.id && <Loader2 size={14} style={{ marginLeft: "auto", animation: "kmm-giro 1s linear infinite", color: C.muted }} />}
            </label>
          ))}
          {falha && <p role="alert" style={{ margin: "4px 0 0", fontSize: 12.5, color: C.red }}>{falha}</p>}
          {!pode && <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted }}>Somente visualização: quem movimenta o fluxo marca os itens.</p>}
        </div>
      )}
      <style>{"@keyframes kmm-giro{to{transform:rotate(360deg)}}"}</style>
    </Bloco>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function Descricao({ id, aba }: { id: number; aba: AbaEtapa }) {
  const { dados, erro, carregando } = useCarga<{ html: string; vazia: boolean; truncada: boolean }>(`/api/fluxo-po/pbi/${id}/descricao`);
  return (
    <Bloco
      titulo="Descrição da solicitação"
      extra={
        // T18: só na aba 1.1, junto da descrição. SEM FUNÇÃO nesta fase (Fase 2 do roadmap): não tem ação ao clicar.
        aba === "1.1" ? (
          <button
            type="button"
            className="kmm-btn"
            title="Em breve: o agente que ajuda a classificar a demanda chega em uma fase seguinte"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}
          >
            <Sparkles size={14} color={C.orange} />
            Agente de Classificação
            <span style={{ fontSize: 10.5, fontWeight: 600, color: C.muted, background: C.soft, borderRadius: 999, padding: "0 7px" }}>em breve</span>
          </button>
        ) : undefined
      }
    >
      {carregando && !dados ? (
        <Carregando />
      ) : erro ? (
        <Erro texto={erro} />
      ) : !dados || dados.vazia ? (
        <Vazio texto="O PBI não tem descrição." />
      ) : (
        <>
          <div className="fp-html" style={{ maxHeight: 360, overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: dados.html }} />
          {dados.truncada && <p style={{ margin: "6px 0 0", fontSize: 12, color: C.muted }}>Descrição muito longa: mostrando só o começo. Veja o texto completo no Azure DevOps.</p>}
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: C.faint }}>Somente leitura (campo Descrição do PBI).</p>
        </>
      )}
    </Bloco>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function Comentarios({ id, pode, motivoSemPermissao, aoPublicar }: { id: number; pode: boolean; motivoSemPermissao: string | null; aoPublicar?: () => void }) {
  const { dados, erro, carregando, recarregar } = useCarga<{ total: number; comentarios: Comentario[]; truncado: boolean }>(`/api/fluxo-po/pbi/${id}/comentarios`);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [publicado, setPublicado] = useState(false);
  const vazio = texto.trim() === "";
  const longo = texto.trim().length > LIMITE_COMENTARIO;

  async function publicar() {
    if (vazio || longo || enviando) return;
    setEnviando(true);
    setFalha(null);
    setPublicado(false);
    try {
      const res = await fetch(`/api/fluxo-po/pbi/${id}/comentarios`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFalha(j.erro ?? "Não foi possível publicar o comentário.");
        return;
      }
      setTexto("");
      setPublicado(true);
      recarregar();
      aoPublicar?.(); // comentar sobe a revisão do PBI no Azure: a tela reajusta a referência para não se acusar
    } catch {
      setFalha("Não foi possível falar com o servidor. O comentário não foi publicado.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Bloco titulo="Comentários" extra={dados && <span style={{ fontSize: 12, color: C.muted }}>{dados.total} no PBI</span>}>
      {pode ? (
        <div style={{ marginBottom: 12 }}>
          <textarea
            className="kmm-input"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPublicado(false);
            }}
            rows={3}
            placeholder="Escreva um comentário. Ele é publicado no PBI do Azure DevOps."
            aria-label="Novo comentário"
            disabled={enviando}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              className="kmm-btn"
              onClick={publicar}
              disabled={vazio || longo || enviando}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: !vazio && !longo ? C.orange : C.soft, color: !vazio && !longo ? "#fff" : C.faint, borderColor: !vazio && !longo ? C.orange : C.border, fontWeight: 600, cursor: !vazio && !longo && !enviando ? "pointer" : "not-allowed" }}
            >
              {enviando ? <Loader2 size={14} style={{ animation: "kmm-giro 1s linear infinite" }} /> : <Send size={14} />}
              {enviando ? "Publicando…" : "Publicar comentário"}
            </button>
            <span style={{ fontSize: 11.5, color: longo ? C.red : C.faint }}>{texto.trim().length}/{LIMITE_COMENTARIO}</span>
            {publicado && <span style={{ fontSize: 12, color: PASTEL.green.dot, display: "inline-flex", alignItems: "center", gap: 4 }}><Check size={13} /> Comentário publicado no PBI</span>}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: C.faint }}>No Azure DevOps o autor aparece como o da integração; seu nome e a data vão no texto ("via Produto Hub").</p>
          {falha && <p role="alert" style={{ margin: "6px 0 0", fontSize: 12.5, color: C.red }}>{falha}</p>}
        </div>
      ) : (
        <p title={motivoSemPermissao ?? ""} style={{ margin: "0 0 10px", fontSize: 12, color: C.muted }}>Somente visualização: quem movimenta o fluxo publica comentários.</p>
      )}

      {carregando && !dados ? (
        <Carregando />
      ) : erro ? (
        <Erro texto={erro} />
      ) : !dados?.comentarios.length ? (
        <Vazio texto="Nenhum comentário no PBI." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto" }}>
          {dados.comentarios.map((c) => (
            <article key={c.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: C.muted, marginBottom: 4 }}>
                <strong style={{ color: C.text }}>{c.autor}</strong>
                <span>{dataHora(c.quando)}</span>
                {c.editadoEm && <span>(editado em {dataHora(c.editadoEm)})</span>}
              </div>
              <div className="fp-html" dangerouslySetInnerHTML={{ __html: c.html }} />
            </article>
          ))}
          {dados.truncado && <Vazio texto="Há mais comentários no Azure DevOps do que os mostrados aqui." />}
        </div>
      )}
      <style>{"@keyframes kmm-giro{to{transform:rotate(360deg)}}"}</style>
    </Bloco>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function QuandoAvanca({ aba }: { aba: AbaEtapa }) {
  return (
    <Bloco titulo="Quando avança">
      <p style={{ margin: 0, fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>{QUANDO_AVANCA[aba]}</p>
    </Bloco>
  );
}

function AoAvancar({ aba }: { aba: AbaEtapa }) {
  return (
    <Bloco titulo="Ao avançar, grava no PBI">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {AO_AVANCAR[aba].map((a) => (
          <div key={a.destino}>
            {AO_AVANCAR[aba].length > 1 && <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 3 }}>Para {rotuloDaEtapa(a.destino as EtapaFluxo)}</div>}
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: C.text }}>
              {a.grava.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Bloco>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function Anexos({ id }: { id: number }) {
  const { dados, erro, carregando } = useCarga<{ anexos: AnexoPbi[]; truncado: boolean }>(`/api/fluxo-po/pbi/${id}/anexos`);
  return (
    <Bloco titulo="Anexos" extra={dados && dados.anexos.length > 0 && <span style={{ fontSize: 12, color: C.muted }}>{dados.anexos.length}</span>}>
      {carregando && !dados ? (
        <Carregando />
      ) : erro ? (
        <Erro texto={erro} />
      ) : !dados?.anexos.length ? (
        <Vazio texto="O PBI não tem anexos." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dados.anexos.map((a) => (
            <a key={a.link} href={a.link} target="_blank" rel="noopener noreferrer" title="Abrir o anexo no Azure DevOps" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 10, textDecoration: "none", color: C.text }}>
              <Paperclip size={15} color={C.muted} style={{ flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</span>
                <span style={{ display: "block", fontSize: 11.5, color: C.muted }}>
                  {[tamanho(a.tamanho), a.autor, a.quando ? dataHora(a.quando) : ""].filter(Boolean).join(" · ")}
                </span>
              </span>
              <ExternalLink size={13} color={C.faint} style={{ marginLeft: "auto", flexShrink: 0 }} />
            </a>
          ))}
          {dados.truncado && <Vazio texto="Há mais anexos no Azure DevOps do que os mostrados aqui." />}
        </div>
      )}
    </Bloco>
  );
}

// ---------------------------------------------------------------------------------------------------------------

const COR_RESULTADO: Record<string, { bg: string; fg: string; rotulo: string }> = {
  sucesso: { bg: PASTEL.green.bg, fg: PASTEL.green.dot, rotulo: "Concluído" },
  parcial: { bg: PASTEL.amber.bg, fg: PASTEL.amber.dot, rotulo: "Concluído com aviso" },
  bloqueado: { bg: "#FDF1F0", fg: C.red, rotulo: "Bloqueado" },
  sem_permissao: { bg: "#FDF1F0", fg: C.red, rotulo: "Sem permissão" },
  conflito: { bg: "#FDF1F0", fg: C.red, rotulo: "Conflito" },
  erro: { bg: "#FDF1F0", fg: C.red, rotulo: "Erro" },
};

function Historico({ id, versao }: { id: number; versao: number | undefined }) {
  const [visao, setVisao] = useState<"azure" | "plataforma">("azure");
  const azure = useCarga<{ entradas: EntradaHistorico[]; truncado: boolean }>(`/api/fluxo-po/pbi/${id}/historico`, [versao]);
  const plataforma = useCarga<{ movimentos: MovimentoPbi[]; truncado: boolean }>(`/api/fluxo-po/pbi/${id}/movimentos`, [versao]);
  const carga = visao === "azure" ? azure : plataforma;

  const botao = (v: "azure" | "plataforma", texto: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={visao === v}
      onClick={() => setVisao(v)}
      style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: visao === v ? 600 : 500, padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: visao === v ? "#E6E7EE" : "transparent", color: visao === v ? C.text : C.muted }}
    >
      {texto}
    </button>
  );

  return (
    <Bloco
      titulo="Histórico"
      extra={
        <div role="tablist" aria-label="Tipo de histórico" style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "#F2F2F6" }}>
          {botao("azure", "PBI no Azure")}
          {botao("plataforma", "Movimentos na plataforma")}
        </div>
      }
    >
      {carga.carregando && !carga.dados ? (
        <Carregando />
      ) : carga.erro ? (
        <Erro texto={carga.erro} />
      ) : visao === "azure" ? (
        !azure.dados?.entradas.length ? (
          <Vazio texto="Sem alterações registradas no PBI." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
            {azure.dados.entradas.map((e) => (
              <div key={e.rev} style={{ borderLeft: `3px solid ${C.border}`, padding: "2px 0 2px 10px" }}>
                <div style={{ fontSize: 12, color: C.muted }}>
                  <strong style={{ color: C.text }}>{e.usuario}</strong> · {dataHora(e.quando)} · rev {e.rev}
                </div>
                {e.mudancas.map((m, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: C.text, marginTop: 2 }}>
                    <span style={{ fontWeight: 600 }}>{m.campo}:</span> <span style={{ color: C.muted }}>{m.de ?? "vazio"}</span> → {m.para ?? "vazio"}
                  </div>
                ))}
              </div>
            ))}
            {azure.dados.truncado && <Vazio texto="Há revisões mais antigas no Azure DevOps." />}
          </div>
        )
      ) : !plataforma.dados?.movimentos.length ? (
        <Vazio texto="Nenhum movimento ou edição feito por aqui neste PBI." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
          {plataforma.dados.movimentos.map((m) => {
            const cor = COR_RESULTADO[m.resultado] ?? COR_RESULTADO.erro;
            const oque = m.direcao === "edicao" ? "Edição das informações" : `${m.direcao === "volta" ? "Voltou" : "Avançou"}: ${m.origem ?? "—"} → ${m.destino}${m.proposta ? " (proposta)" : ""}`;
            return (
              <div key={m.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
                  <strong style={{ color: C.text }}>{oque}</strong>
                  <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "1px 8px", background: cor.bg, color: cor.fg }}>{cor.rotulo}</span>
                  <span style={{ marginLeft: "auto", color: C.muted, fontSize: 12 }}>{m.quem} · {dataHora(m.quando)}</span>
                </div>
                {m.motivo && <div style={{ fontSize: 12.5, color: C.red, marginTop: 4 }}>{m.motivo}</div>}
                {m.alteracoes.map((a) => (
                  <div key={a.campo} style={{ fontSize: 12.5, color: C.text, marginTop: 2 }}>
                    <span style={{ fontWeight: 600 }}>{a.rotulo}:</span> <span style={{ color: C.muted }}>{valorLegivelDaAlteracao(a.campo, a.de)}</span> → {valorLegivelDaAlteracao(a.campo, a.para)}
                  </div>
                ))}
                {(m.avisos.length > 0 || m.assesmentsFalhas > 0 || m.comentarioPublicado === false) && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 4, fontSize: 12, color: "#8a5a00" }}>
                    <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{[...(m.comentarioPublicado === false ? ["Comentário não publicado"] : []), ...(m.assesmentsFalhas > 0 ? [`${m.assesmentsFalhas} Assesment(s) sem a Data Comitê`] : []), ...m.avisos].join(" · ")}</span>
                  </div>
                )}
              </div>
            );
          })}
          {plataforma.dados.truncado && <Vazio texto="Há movimentos mais antigos que os mostrados aqui." />}
        </div>
      )}
    </Bloco>
  );
}


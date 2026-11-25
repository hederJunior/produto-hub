"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, Ban, Bold, Check, ExternalLink, Italic, List, ListOrdered, Loader2, Paperclip, Send, Sparkles, Tag, X } from "lucide-react";
import { C, PASTEL } from "@/lib/kmm-theme";
import { AO_AVANCAR, LIMITE_COMENTARIO, MOTIVOS_CANCELAMENTO, QUANDO_AVANCA, motivoDeCancelamento, rotuloDaEtapa, valorLegivelDaAlteracao, type EtapaFluxo, type MotivoCancelamento } from "@/lib/fluxo-po";
import { TAG_PRONTO_REFINAMENTO_TECH, urlPbiAzure } from "@/lib/fluxo-po-campos";
import type { ChecklistPbi, ItemChecklistEstado } from "@/lib/fluxo-po-checklist";
import type { AnexoPbi, EntradaHistorico, MovimentoPbi } from "@/lib/fluxo-po-detalhe";
import { LIMITE_OBSERVACAO, PERGUNTAS_SEGURANCA, ROTULO_RESPOSTA, type ItemSeguranca, type RespostaSeguranca } from "@/lib/fluxo-po-seguranca";

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
.fp-editor{ min-height:150px; max-height:380px; overflow-y:auto; border:1px solid ${C.border}; border-radius:10px; padding:10px 12px; background:#fff; outline:none; }
.fp-editor:focus{ border-color:#F5C5AA; box-shadow:0 0 0 3px #FFF1EA; }
.fp-editor:empty:before{ content:attr(data-placeholder); color:${C.faint}; }
`;

/**
 * Blocos do detalhe do card (T17): checklist da etapa, descrição (com o botão do Agente de Classificação na 1.1), comentários,
 * anexos, histórico do PBI e dos movimentos, e os quadros "Quando avança" e "Ao avançar, grava no PBI". Cada um lê sua parte
 * do servidor (T08/T10) sozinho. Escrever (checklist, comentário) exige poder movimentar; o servidor confere.
 */
/** Resposta de `POST /api/fluxo-po/pbi/<id>/cancelamento` em caso de sucesso. */
export type RespostaCancelamento = { comentario: { publicado: boolean; id?: number; erro?: string }; avisos: string[] };

export default function FluxoPoDetalheBlocos({
  id,
  aba,
  pode,
  motivoSemPermissao,
  versao,
  etapaAtual,
  aoPublicarComentario,
  aoCancelarDemanda,
}: {
  id: number;
  aba: AbaEtapa;
  pode: boolean;
  motivoSemPermissao: string | null;
  versao: number | undefined;
  /** Etapa em que o card está agora (o cancelamento só vale na 1.1). */
  etapaAtual: EtapaFluxo | null;
  aoPublicarComentario?: () => void;
  aoCancelarDemanda?: (r: RespostaCancelamento) => void;
}) {
  // Registrar os requisitos de segurança muda a Description do PBI: a descrição mostrada na tela é recarregada.
  const [versaoDescricao, setVersaoDescricao] = useState(0);
  return (
    <div style={{ marginTop: 14 }}>
      <style>{ESTILO_HTML}</style>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Checklist id={id} aba={aba} pode={pode} motivoSemPermissao={motivoSemPermissao} />
          <Descricao id={id} aba={aba} versao={versaoDescricao} />
          {aba === "1.2" && <RequisitosSeguranca id={id} pode={pode} motivoSemPermissao={motivoSemPermissao} etapaAtual={etapaAtual} aoRegistrar={() => setVersaoDescricao((n) => n + 1)} />}
          {aba === "2.1" && <Analise id={id} pode={pode} motivoSemPermissao={motivoSemPermissao} etapaAtual={etapaAtual} />}
          {(aba === "1.1" || aba === "1.2") && <Cancelamento id={id} pode={pode} motivoSemPermissao={motivoSemPermissao} etapaAtual={etapaAtual} aoCancelar={aoCancelarDemanda} />}
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

function Descricao({ id, aba, versao }: { id: number; aba: AbaEtapa; versao: number }) {
  const { dados, erro, carregando } = useCarga<{ html: string; vazia: boolean; truncada: boolean }>(`/api/fluxo-po/pbi/${id}/descricao`, [versao]);
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

// ---------------------------------------------------------------------------------------------------------------

/** Assesment filho do PBI como a API devolve (HTML já sanitizado; `rev` é a base da trava de edição). */
type AssesmentAnalise = {
  id: number;
  titulo: string;
  estado: string;
  rev: number;
  html: string;
  vazia: boolean;
  truncada: boolean;
  perdas: { imagens: number; estilos: boolean };
};

/**
 * Requisitos de segurança e privacidade de dados (etapa 1.2, pedido por Heder em 2026-11-25): formulário de 7 perguntas (Sim / Não /
 * Não aplicável + observação). "Registrar requisitos" grava o formulário como complemento no fim da Description do PBI (substitui o
 * anterior, se houver). Só quem movimenta o fluxo e só com o card na 1.2; o servidor confere tudo de novo e, se outra pessoa mudou o
 * formulário no Azure enquanto a tela estava aberta, recusa (409). Todas as perguntas precisam de resposta para registrar.
 */
function RequisitosSeguranca({ id, pode, motivoSemPermissao, etapaAtual, aoRegistrar }: { id: number; pode: boolean; motivoSemPermissao: string | null; etapaAtual: EtapaFluxo | null; aoRegistrar: () => void }) {
  const { dados, erro, carregando, setDados } = useCarga<{ etapa: string | null; registrado: boolean; itens: ItemSeguranca[] }>(`/api/fluxo-po/pbi/${id}/seguranca`);
  const [itens, setItens] = useState<ItemSeguranca[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<{ mensagem: string; conflito: boolean } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // O que está no Azure (base da trava) e o que está sendo preenchido; quando os dados mudam (abrir, depois de registrar), o rascunho recomeça deles.
  useEffect(() => {
    if (dados) setItens(dados.itens.map((i) => ({ ...i })));
  }, [dados]);

  const liberado = pode && etapaAtual === "1.2";
  const respondidas = (itens ?? []).filter((i) => i.resposta !== null).length;
  const total = PERGUNTAS_SEGURANCA.length;
  const resumo = (x: ItemSeguranca[]) => JSON.stringify(x.map((i) => [i.id, i.resposta, i.observacao.trim()]));
  const alterado = !!itens && !!dados && resumo(itens) !== resumo(dados.itens);
  const podeRegistrar = liberado && !enviando && respondidas === total && (alterado || !dados?.registrado);

  function mudar(idPergunta: string, parte: Partial<ItemSeguranca>) {
    setOk(null);
    setItens((atual) => (atual ? atual.map((i) => (i.id === idPergunta ? { ...i, ...parte } : i)) : atual));
  }

  async function registrar() {
    if (!podeRegistrar || !itens || !dados) return;
    setEnviando(true);
    setFalha(null);
    setOk(null);
    try {
      const res = await fetch(`/api/fluxo-po/pbi/${id}/seguranca`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas: itens, base: dados.registrado ? dados.itens : null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFalha({ mensagem: j.erro ?? "Não foi possível registrar os requisitos.", conflito: res.status === 409 });
        return;
      }
      setDados(j.estado);
      setOk(["Requisitos registrados na descrição do PBI.", ...(j.avisos ?? [])].join(" "));
      aoRegistrar();
    } catch {
      setFalha({ mensagem: "Não foi possível falar com o servidor. Nada foi registrado.", conflito: false });
    } finally {
      setEnviando(false);
    }
  }

  const dica = !pode ? (motivoSemPermissao ?? "Seu perfil só permite visualizar.") : etapaAtual !== "1.2" ? "Disponível só enquanto o card está na etapa 1.2." : "";

  return (
    <Bloco
      titulo="Requisitos de segurança e privacidade de dados"
      extra={
        dados && (
          <span style={{ fontSize: 12, fontWeight: 600, color: dados.registrado ? PASTEL.green.dot : C.muted }}>
            {dados.registrado ? "Registrado no PBI" : "Ainda não registrado"} · {respondidas} de {total}
          </span>
        )
      }
    >
      {carregando && !dados ? (
        <Carregando />
      ) : erro ? (
        <Erro texto={erro} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
            Requisitos para softwares/projetos desenvolvidos pela KMM. Ao registrar, o formulário entra como complemento no fim da Descrição do PBI.
          </p>
          {PERGUNTAS_SEGURANCA.map((p, idx) => {
            const item = itens?.find((i) => i.id === p.id);
            return (
              <fieldset key={p.id} disabled={!liberado || enviando} title={dica} style={{ margin: 0, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
                <legend style={{ padding: "0 4px", fontSize: 11.5, fontWeight: 600, color: C.muted }}>Pergunta {idx + 1}</legend>
                <div style={{ fontSize: 13.5, color: C.text, marginBottom: 8 }}>{p.texto}</div>
                <div role="radiogroup" aria-label={`Resposta da pergunta ${idx + 1}`} style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
                  {(["sim", "nao", "na"] as RespostaSeguranca[]).map((r) => (
                    <label key={r} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: liberado ? "pointer" : "default" }}>
                      <input type="radio" name={`seg-${id}-${p.id}`} checked={item?.resposta === r} onChange={() => mudar(p.id, { resposta: r })} />
                      {ROTULO_RESPOSTA[r]}
                    </label>
                  ))}
                </div>
                <textarea
                  className="kmm-input"
                  rows={2}
                  maxLength={LIMITE_OBSERVACAO}
                  value={item?.observacao ?? ""}
                  placeholder="Observação (opcional)"
                  aria-label={`Observação da pergunta ${idx + 1}`}
                  onChange={(e) => mudar(p.id, { observacao: e.target.value })}
                  style={{ width: "100%", resize: "vertical", fontSize: 13 }}
                />
              </fieldset>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="kmm-btn"
              onClick={registrar}
              disabled={!podeRegistrar}
              title={dica || (respondidas < total ? "Responda todas as perguntas para registrar." : !alterado && dados?.registrado ? "Nada mudou desde o último registro." : "")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: podeRegistrar ? 1 : 0.55, cursor: podeRegistrar ? "pointer" : "not-allowed" }}
            >
              {enviando ? <Loader2 size={14} className="kmm-spin" /> : <Check size={14} color={C.green} />}
              Registrar requisitos
            </button>
            {liberado && respondidas < total && <span style={{ fontSize: 12, color: C.muted }}>Faltam {total - respondidas} resposta(s).</span>}
          </div>
          {ok && <p role="status" style={{ margin: 0, fontSize: 12.5, color: C.green }}>{ok}</p>}
          {falha && (
            <p role="alert" style={{ margin: 0, fontSize: 12.5, color: C.red }}>
              {falha.mensagem}{" "}
              {falha.conflito && (
                <button type="button" className="kmm-btn" onClick={() => window.location.reload()} style={{ marginLeft: 6, fontSize: 12 }}>
                  Recarregar
                </button>
              )}
            </p>
          )}
          {!liberado && <p style={{ margin: 0, fontSize: 12, color: C.muted }}>{dica}</p>}
        </div>
      )}
    </Bloco>
  );
}

/**
 * Botão "Necessário análise tech" (etapa 2.1, pedido por Heder em 2026-11-24): acrescenta ao PBI a tag "Pronto para refinamento tech" (as outras tags
 * ficam). Só quem movimenta e só com o card na 2.1; depois de aplicada, o botão fica marcado e desabilitado. O servidor confere tudo de novo.
 */
function BotaoAnaliseTech({ id, pode, motivoSemPermissao, etapaAtual }: { id: number; pode: boolean; motivoSemPermissao: string | null; etapaAtual: EtapaFluxo | null }) {
  const { dados, setDados } = useCarga<{ aplicada: boolean }>(`/api/fluxo-po/pbi/${id}/tag-tech`);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);
  const liberado = pode && etapaAtual === "2.1";
  const aplicada = dados?.aplicada === true;
  const desabilitado = !liberado || aplicada || enviando || !dados;

  async function marcar() {
    if (desabilitado) return;
    if (!window.confirm(`Adicionar ao PBI a tag "${TAG_PRONTO_REFINAMENTO_TECH}"?`)) return;
    setEnviando(true);
    setMensagem(null);
    try {
      const res = await fetch(`/api/fluxo-po/pbi/${id}/tag-tech`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMensagem({ texto: j.erro ?? "Não foi possível aplicar a tag.", erro: true });
        return;
      }
      setDados({ aplicada: true });
      setMensagem({ texto: j.jaTinha ? "O PBI já tinha a tag." : "Tag aplicada ao PBI.", erro: false });
    } catch {
      setMensagem({ texto: "Não foi possível aplicar a tag (sem conexão com o servidor).", erro: true });
    } finally {
      setEnviando(false);
    }
  }

  const dica = aplicada
    ? `O PBI já tem a tag "${TAG_PRONTO_REFINAMENTO_TECH}".`
    : !pode
      ? (motivoSemPermissao ?? "Seu perfil só permite visualizar.")
      : etapaAtual !== "2.1"
        ? "Disponível só enquanto o card está na etapa 2.1."
        : `Adiciona ao PBI a tag "${TAG_PRONTO_REFINAMENTO_TECH}".`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button type="button" className="kmm-btn" onClick={marcar} disabled={desabilitado} title={dica} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, opacity: desabilitado && !aplicada ? 0.55 : 1, cursor: desabilitado ? "not-allowed" : "pointer" }}>
        {enviando ? <Loader2 size={14} className="kmm-spin" /> : aplicada ? <Check size={14} color={C.green} /> : <Tag size={14} color={C.orange} />}
        Necessário análise tech
      </button>
      {aplicada && !mensagem && <span style={{ fontSize: 11, color: C.green }}>Tag &quot;{TAG_PRONTO_REFINAMENTO_TECH}&quot; aplicada</span>}
      {mensagem && <span role={mensagem.erro ? "alert" : "status"} style={{ fontSize: 11.5, color: mensagem.erro ? C.red : C.green, maxWidth: 260, textAlign: "right" }}>{mensagem.texto}</span>}
    </div>
  );
}

/**
 * Análise (etapa 2.1, pedido por Heder em 2026-11-24): o campo Description dos Assesments FILHOS do PBI. Quem pode movimentar edita
 * (com o card na 2.1) e "Registrar Análise" grava o texto no Assesment; os demais só leem. O texto é HTML: o editor oferece negrito,
 * itálico e listas, e o servidor limpa o que for além disso, então o bloco avisa ANTES quando o texto atual tem imagens ou estilos
 * que se perderiam. A trava de revisão do Assesment evita sobrescrever uma edição feita por outra pessoa no Azure DevOps.
 */
function Analise({ id, pode, motivoSemPermissao, etapaAtual }: { id: number; pode: boolean; motivoSemPermissao: string | null; etapaAtual: EtapaFluxo | null }) {
  const { dados, erro, carregando, recarregar, setDados } = useCarga<{ assesments: AssesmentAnalise[] }>(`/api/fluxo-po/pbi/${id}/analise`);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [ciente, setCiente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<{ mensagem: string; conflito: boolean } | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const base = useRef("");

  const lista = dados?.assesments ?? [];
  const atual = lista.find((a) => a.id === selecionado) ?? lista[0] ?? null;
  const emDia = etapaAtual === "2.1";
  const editavel = pode && emDia && !!atual && !atual.truncada;
  const comPerdas = !!atual && (atual.perdas.imagens > 0 || atual.perdas.estilos);

  // Carrega o texto salvo no editor quando muda o Assesment ou a revisão (abrir, trocar, depois de registrar).
  useEffect(() => {
    if (editor.current && atual) {
      editor.current.innerHTML = atual.html;
      base.current = editor.current.innerHTML;
    }
    setAlterado(false);
    setCiente(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual?.id, atual?.rev, editavel]);

  function trocar(novoId: number) {
    if (alterado && !window.confirm("Há alterações que ainda não foram registradas. Descartar e trocar de Assesment?")) return;
    setFalha(null);
    setOk(null);
    setSelecionado(novoId);
  }

  function formatar(comando: "bold" | "italic" | "insertUnorderedList" | "insertOrderedList") {
    editor.current?.focus();
    document.execCommand(comando);
    aoDigitar();
  }

  function aoDigitar() {
    if (editor.current) setAlterado(editor.current.innerHTML !== base.current);
    setOk(null);
  }

  /** Cola só o texto (sem a formatação de onde veio): o que o servidor guardaria de qualquer jeito é um HTML simples. */
  function colar(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }

  const podeRegistrar = editavel && alterado && !enviando && (!comPerdas || ciente);

  async function registrar() {
    if (!atual || !editor.current || !podeRegistrar) return;
    setEnviando(true);
    setFalha(null);
    setOk(null);
    try {
      const res = await fetch(`/api/fluxo-po/pbi/${id}/analise`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assesmentId: atual.id, html: editor.current.innerHTML, rev: atual.rev }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFalha({ mensagem: j.erro ?? "Não foi possível registrar a análise.", conflito: res.status === 409 });
        return;
      }
      const novo = j.assesment as AssesmentAnalise;
      setDados((d) => (d ? { assesments: d.assesments.map((a) => (a.id === novo.id ? novo : a)) } : d));
      setOk(`Análise registrada no Assesment ${novo.id}.`);
    } catch {
      setFalha({ mensagem: "Não foi possível registrar a análise (sem conexão com o servidor).", conflito: false });
    } finally {
      setEnviando(false);
    }
  }

  const botaoFormato: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 28, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", color: C.text };

  return (
    <Bloco titulo="Análise (Assesment)" extra={<BotaoAnaliseTech id={id} pode={pode} motivoSemPermissao={motivoSemPermissao} etapaAtual={etapaAtual} />}>
      {carregando && !dados ? (
        <Carregando />
      ) : erro ? (
        <Erro texto={erro} />
      ) : !atual ? (
        <Vazio texto="Este PBI não tem Assesment filho, então não há análise para mostrar." />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10, fontSize: 12.5, color: C.muted }}>
            {lista.length > 1 ? (
              <select value={atual.id} onChange={(e) => trocar(Number(e.target.value))} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "5px 9px", fontSize: 12.5, color: C.text, background: "#fff", fontFamily: "inherit", maxWidth: "100%" }}>
                {lista.map((a) => (
                  <option key={a.id} value={a.id}>
                    Assesment {a.id} · {a.titulo}
                  </option>
                ))}
              </select>
            ) : (
              <span>
                Assesment <strong style={{ color: C.text }}>{atual.id}</strong> · {atual.titulo}
              </span>
            )}
            <span style={{ background: C.soft, borderRadius: 999, padding: "1px 9px", fontSize: 11.5 }}>{atual.estado || "—"}</span>
            <a href={urlPbiAzure(atual.id)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.muted, textDecoration: "none" }}>
              Abrir no Azure DevOps <ExternalLink size={12} />
            </a>
          </div>

          {atual.truncada && (
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "#8a5a00" }}>Texto muito longo: a edição aqui foi desativada para não cortar o conteúdo. Edite no Azure DevOps.</p>
          )}

          {editavel ? (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }} role="toolbar" aria-label="Formatação">
                <button type="button" title="Negrito" aria-label="Negrito" style={botaoFormato} onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("bold")}>
                  <Bold size={14} />
                </button>
                <button type="button" title="Itálico" aria-label="Itálico" style={botaoFormato} onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("italic")}>
                  <Italic size={14} />
                </button>
                <button type="button" title="Lista" aria-label="Lista" style={botaoFormato} onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("insertUnorderedList")}>
                  <List size={14} />
                </button>
                <button type="button" title="Lista numerada" aria-label="Lista numerada" style={botaoFormato} onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("insertOrderedList")}>
                  <ListOrdered size={14} />
                </button>
              </div>
              <div
                ref={editor}
                className="fp-html fp-editor"
                contentEditable={!enviando}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label="Texto da análise"
                data-placeholder="Escreva a análise…"
                onInput={aoDigitar}
                onPaste={colar}
              />
            </>
          ) : (
            <>
              {atual.vazia ? <Vazio texto="O Assesment ainda não tem análise registrada." /> : <div className="fp-html" style={{ maxHeight: 360, overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: atual.html }} />}
              <p style={{ margin: "8px 0 0", fontSize: 11.5, color: C.faint }}>
                {!pode ? (motivoSemPermissao ?? "Seu perfil só permite visualizar.") : !emDia ? "A edição só está liberada enquanto o card está na etapa 2.1." : "Somente leitura."}
              </p>
            </>
          )}

          {editavel && comPerdas && (
            <div role="alert" style={{ marginTop: 10, background: PASTEL.amber.bg, border: "1px solid #F6DDB5", color: "#8a5a00", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, lineHeight: 1.45 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  O texto atual tem {atual.perdas.imagens > 0 ? `${atual.perdas.imagens} ${atual.perdas.imagens === 1 ? "imagem" : "imagens"}` : ""}
                  {atual.perdas.imagens > 0 && atual.perdas.estilos ? " e " : ""}
                  {atual.perdas.estilos ? "formatação (cores, fontes)" : ""} que este editor não guarda: ao registrar, {atual.perdas.imagens > 0 ? "as imagens viram \"[imagem]\" e " : ""}a formatação extra se perde. Para manter, edite direto no Azure DevOps.
                </span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, cursor: "pointer", fontWeight: 600 }}>
                <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} style={{ accentColor: C.orange }} />
                Entendo e quero registrar mesmo assim
              </label>
            </div>
          )}

          {falha && (
            <div role="alert" style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8, color: C.red, fontSize: 12.5 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {falha.mensagem}{" "}
                {falha.conflito && (
                  <button type="button" onClick={() => { setFalha(null); recarregar(); }} className="kmm-btn" style={{ fontSize: 12, padding: "3px 10px", marginLeft: 4 }}>
                    Recarregar a versão do Azure
                  </button>
                )}
              </span>
            </div>
          )}
          {ok && (
            <p role="status" style={{ margin: "10px 0 0", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.green }}>
              <Check size={14} /> {ok}
            </p>
          )}

          {editavel && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="kmm-btn primary" onClick={registrar} disabled={!podeRegistrar} style={{ display: "inline-flex", alignItems: "center", gap: 7, opacity: podeRegistrar ? 1 : 0.55, cursor: podeRegistrar ? "pointer" : "not-allowed" }}>
                {enviando ? <Loader2 size={14} className="kmm-spin" /> : <Send size={14} />}
                {enviando ? "Registrando…" : "Registrar Análise"}
              </button>
              <span style={{ fontSize: 12, color: alterado ? "#8a5a00" : C.faint }}>{alterado ? "Alterações ainda não registradas." : "Nada para registrar."}</span>
            </div>
          )}
        </>
      )}
    </Bloco>
  );
}

/**
 * Cancelamento de Demanda (abas 1.1 e 1.2, entre a descrição e os comentários): o usuário escolhe um dos 7 motivos; o texto padrão do motivo
 * aparece para ele REVISAR E EDITAR; só ao confirmar o texto é publicado como comentário no PBI e o Status do card muda para Cancelado
 * (o card sai do quadro). Só quem movimenta o fluxo, e só para card que está na 1.1 ou na 1.2; o servidor confere tudo de novo.
 */
function Cancelamento({ id, pode, motivoSemPermissao, etapaAtual, aoCancelar }: { id: number; pode: boolean; motivoSemPermissao: string | null; etapaAtual: EtapaFluxo | null; aoCancelar?: (r: RespostaCancelamento) => void }) {
  const [motivoId, setMotivoId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<{ mensagem: string; faltas: string[] } | null>(null);
  const motivo = motivoDeCancelamento(motivoId);
  const editado = !!motivo && texto !== motivo.texto;
  const naEtapa = etapaAtual === "1.1" || etapaAtual === "1.2";
  const liberado = pode && naEtapa;
  const vazio = texto.trim() === "";
  const longo = texto.trim().length > LIMITE_COMENTARIO;
  const podeConfirmar = liberado && !!motivo && !vazio && !longo && !enviando;

  function escolher(m: MotivoCancelamento) {
    if (m.id === motivoId) return;
    if (editado && !window.confirm("Trocar o motivo substitui o texto que você editou pelo texto padrão do novo motivo. Continuar?")) return;
    setMotivoId(m.id);
    setTexto(m.texto);
    setFalha(null);
  }

  /** "Não cancelar demanda": descarta o motivo, o texto (editado ou não) e qualquer erro, e volta ao estado de antes do primeiro clique. */
  function naoCancelar() {
    if (enviando) return;
    setMotivoId(null);
    setTexto("");
    setFalha(null);
  }

  async function confirmar() {
    if (!podeConfirmar || !motivo) return;
    setEnviando(true);
    setFalha(null);
    try {
      const res = await fetch(`/api/fluxo-po/pbi/${id}/cancelamento`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo: motivo.id, texto }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFalha({ mensagem: j.erro ?? "Não foi possível cancelar a demanda.", faltas: j.faltas ?? [] });
        return;
      }
      aoCancelar?.(j as RespostaCancelamento);
    } catch {
      setFalha({ mensagem: "Não foi possível falar com o servidor. Nada foi confirmado; tente de novo.", faltas: [] });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Bloco titulo="Cancelamento de Demanda">
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
        Escolha o motivo. O texto padrão aparece abaixo para você revisar e, se quiser, editar. Só quando você confirmar, ele é publicado como comentário no PBI e o Status do card muda para <strong>Cancelado</strong>.
      </p>
      {!pode && <p title={motivoSemPermissao ?? ""} style={{ margin: "0 0 10px", fontSize: 12, color: C.muted }}>Somente visualização: quem movimenta o fluxo cancela demandas.</p>}
      {pode && !naEtapa && (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#8a5a00", background: "#fff6e0", borderRadius: 8, padding: "6px 10px" }}>
          Este card já passou da etapa 1.2 (Priorizar - Backlog da Esteira): só dá para cancelar a demanda enquanto ela está na 1.1 ou na 1.2.
        </p>
      )}

      <div role="radiogroup" aria-label="Motivo do cancelamento" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {MOTIVOS_CANCELAMENTO.map((m) => {
          const marcado = m.id === motivoId;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={marcado}
              disabled={!liberado || enviando}
              onClick={() => escolher(m)}
              style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: marcado ? 700 : 500, padding: "7px 13px", borderRadius: 999, cursor: liberado && !enviando ? "pointer" : "not-allowed", border: `1.5px solid ${marcado ? C.red : C.border}`, background: marcado ? "#FDF1F0" : "#fff", color: marcado ? C.red : C.text, opacity: liberado ? 1 : 0.6 }}
            >
              {m.rotulo}
            </button>
          );
        })}
      </div>

      {motivo && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".03em" }}>Comentário que será publicado no PBI</span>
            {editado && (
              <>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: C.orange, background: "#FFF1EA", borderRadius: 999, padding: "0 7px" }}>texto editado</span>
                <button type="button" onClick={() => setTexto(motivo.texto)} disabled={enviando} style={{ border: "none", background: "transparent", color: C.muted, fontSize: 11.5, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                  Restaurar texto padrão
                </button>
              </>
            )}
          </div>
          <textarea className="kmm-input" aria-label="Texto do comentário de cancelamento" value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} disabled={enviando} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 4, fontSize: 11.5, color: C.faint, flexWrap: "wrap" }}>
            <span>O comentário vai assinado com o seu nome, a data e "via Produto Hub", com o motivo "{motivo.rotulo}".</span>
            <span style={{ color: longo ? C.red : C.faint }}>{texto.trim().length}/{LIMITE_COMENTARIO}</span>
          </div>

          <div role="note" style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, background: "#FDF1F0", border: "1px solid #F3C9C4", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, color: C.text }}>
            <AlertTriangle size={15} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Ao confirmar, o comentário é publicado no PBI e o <strong>Status passa para Cancelado</strong>: o card sai do quadro do Fluxo do PO. Para desfazer, é preciso alterar o Status no Azure DevOps.</span>
          </div>

          {falha && (
            <div role="alert" style={{ marginTop: 10, fontSize: 13, color: C.red, background: "#FDF1F0", borderRadius: 8, padding: "9px 12px" }}>
              <div style={{ fontWeight: 600 }}>{falha.mensagem}</div>
              {falha.faltas.map((f) => (
                <div key={f} style={{ marginTop: 3 }}>{f}</div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button
            type="button"
            onClick={confirmar}
            disabled={!podeConfirmar}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 10, border: `1px solid ${podeConfirmar ? C.red : C.border}`, background: podeConfirmar ? C.red : C.soft, color: podeConfirmar ? "#fff" : C.faint, cursor: podeConfirmar ? "pointer" : "not-allowed" }}
          >
            {enviando ? <Loader2 size={15} style={{ animation: "kmm-giro 1s linear infinite" }} /> : <Ban size={15} />}
            {enviando ? "Publicando e cancelando…" : "Publicar comentário e cancelar demanda"}
          </button>
          <button
            type="button"
            onClick={naoCancelar}
            disabled={enviando}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#fff", color: C.text, cursor: enviando ? "not-allowed" : "pointer", opacity: enviando ? 0.6 : 1 }}
          >
            <X size={15} />
            Não cancelar demanda
          </button>
          </div>
        </div>
      )}
      <style>{"@keyframes kmm-giro{to{transform:rotate(360deg)}}"}</style>
    </Bloco>
  );
}

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
            const oque = m.direcao === "seguranca" ? "Requisitos de segurança registrados" : m.direcao === "tag" ? "Tag de análise tech" : m.direcao === "analise" ? "Análise registrada" : m.direcao === "cancelamento" ? "Cancelamento da demanda" : m.direcao === "edicao" ? "Edição das informações" : `${m.direcao === "volta" ? "Voltou" : "Avançou"}: ${m.origem ?? "—"} → ${m.destino}${m.proposta ? " (proposta)" : ""}`;
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


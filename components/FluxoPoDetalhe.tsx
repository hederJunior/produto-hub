"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Check, Clock, ExternalLink, Eye, Loader2, Lock, MoveRight, RefreshCw, X } from "lucide-react";
import FluxoPoDetalheBlocos from "@/components/FluxoPoDetalheBlocos";
import FluxoPoMoverDialog from "@/components/FluxoPoMoverDialog";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import { C, PASTEL, infoPrioridade } from "@/lib/kmm-theme";
import { formatarChaveDia } from "@/lib/datas";
import { urlPbiAzure } from "@/lib/fluxo-po-campos";
import {
  QUEM_MOVIMENTA,
  agingEmAlerta,
  agingEmDias,
  avaliarEdicao,
  chaveDia,
  comiteAtrasado,
  destinosPossiveis,
  resumirFalta,
  rotuloDaArea,
  rotuloDaEtapa,
  valorLegivelDaAlteracao,
  type Alteracao,
  type CardFluxo,
  type EntradaMovimento,
  type EtapaFluxo,
  type PbiFluxo,
} from "@/lib/fluxo-po";

type Listas = { classificacoes: string[]; clientes: string[]; esteiras: { valor: string; rotulo: string }[]; aviso: string | null };
type Info = { pbi: PbiFluxo; card: CardFluxo | null; listas: Listas; podeMovimentar: boolean; permissao: { pode: boolean; motivo: string | null } };
type Campo = "cliente" | "classificacao" | "areaPath" | "dataAberturaProduto" | "dataComite";
type Rascunho = Record<Campo, string>;
type AbaEtapa = "1.1" | "1.2" | "2.1";

const ABAS: { etapa: AbaEtapa; titulo: string; campos: Campo[]; dica: string }[] = [
  {
    etapa: "1.1",
    titulo: "1.1 - Classificar",
    campos: ["cliente", "classificacao", "areaPath", "dataAberturaProduto"],
    dica: "Para o card ir para a 1.2: esteira definida (Area Path diferente de KMM5), Classificação, Cliente e Data Abertura Produto preenchidos.",
  },
  {
    etapa: "1.2",
    titulo: "1.2 - Priorizar - Backlog da Esteira",
    campos: ["cliente", "classificacao", "dataComite"],
    dica: "Para o card ir para o Comitê (2.1): Data Comitê preenchida. Ao salvar uma Data Comitê, ela é copiada para os Assesments filhos do PBI.",
  },
  {
    etapa: "2.1",
    titulo: "2.1 - Comitê / Proposta de solução",
    campos: ["cliente", "classificacao", "dataComite"],
    dica: "Para o card ir para a Análise (3.1 ou 3.2): Data Comitê preenchida. Ao salvar uma Data Comitê, ela é copiada para os Assesments filhos do PBI.",
  },
];
const ORDEM: EtapaFluxo[] = ["1.1", "1.2", "2.1", "3.1", "3.2", "4.1"];

const ROTULO_CAMPO: Record<Campo, string> = {
  cliente: "Cliente",
  classificacao: "Classificação",
  areaPath: "Area Path (esteira)",
  dataAberturaProduto: "Data Abertura Produto",
  dataComite: "Data Comitê",
};

const COR_DA_ETAPA: Record<EtapaFluxo, { bg: string; dot: string }> = {
  "1.1": PASTEL.sky,
  "1.2": PASTEL.indigo,
  "2.1": PASTEL.purple,
  "3.1": PASTEL.amber,
  "3.2": PASTEL.orange,
  "4.1": PASTEL.green,
};

function rascunhoDe(pbi: PbiFluxo): Rascunho {
  return {
    cliente: pbi.cliente,
    classificacao: pbi.classificacao,
    areaPath: pbi.areaPath,
    dataAberturaProduto: chaveDia(pbi.dataAberturaProduto) ?? "",
    dataComite: chaveDia(pbi.dataComite) ?? "",
  };
}

/**
 * Detalhe de um PBI do Fluxo do PO (T16): cabeçalho, uma aba por etapa (1.1, 1.2, 2.1), faixa de prontidão do card e quadro de
 * informações editáveis (Cliente, Classificação, Area Path, Data Abertura Produto, Data Comitê), gravando no PBI do Azure
 * DevOps com as listas de valores do próprio Azure. Quem só visualiza vê os mesmos dados sem poder editar.
 */
export default function FluxoPoDetalhe({ id }: { id: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [aba, setAba] = useState<AbaEtapa | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<{ mensagem: string; faltas: string[] } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; titulo: string; linhas: string[] } | null>(null);
  const [movendo, setMovendo] = useState(false);
  const [hoje] = useState(() => new Date());
  // T19: revisão do PBI que esta tela mostra, o aviso de "mudou no Azure enquanto você editava" e o conflito de um salvar recusado.
  const [revBase, setRevBase] = useState<number | undefined>(undefined);
  const [mudouNoAzure, setMudouNoAzure] = useState<{ rev: number; por: string | null; em: string | null } | null>(null);
  const [conflito, setConflito] = useState<{ mensagem: string; faltas: string[] } | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    fetch(`/api/fluxo-po/pbi/${encodeURIComponent(id)}/informacoes`, { cache: "no-store" })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (cancelado) return;
        if (!res.ok) {
          setErro(j.erro ?? "Não foi possível carregar o PBI.");
          return;
        }
        setInfo(j as Info);
        setRascunho(rascunhoDe((j as Info).pbi));
        setRevBase((j as Info).pbi.rev);
        setMudouNoAzure(null);
        setConflito(null);
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar o PBI."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [id, recarga]);

  // T19: enquanto a tela está aberta, confere de tempos em tempos (e ao voltar para a janela) se o PBI mudou no Azure DevOps.
  const temInfo = !!info;
  useEffect(() => {
    if (!temInfo || revBase === undefined) return;
    let ativo = true;
    const checar = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/fluxo-po/pbi/${encodeURIComponent(id)}/revisao`, { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (ativo && typeof j.rev === "number" && j.rev !== revBase) setMudouNoAzure({ rev: j.rev, por: j.alteradoPor ?? null, em: j.alteradoEm ?? null });
      } catch {
        /* sem rede agora: tenta na próxima */
      }
    };
    const timer = setInterval(checar, 45_000);
    const aoVoltar = () => document.visibilityState === "visible" && void checar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      ativo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [id, temInfo, revBase]);

  /** Ação NOSSA que também sobe a revisão no Azure (ex.: comentário publicado): reajusta a referência para não nos acusarmos. */
  async function reajustarRevisao() {
    try {
      const res = await fetch(`/api/fluxo-po/pbi/${encodeURIComponent(id)}/revisao`, { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      if (typeof j.rev === "number") {
        setRevBase(j.rev);
        setMudouNoAzure(null);
      }
    } catch {
      /* a próxima checagem corrige */
    }
  }

  const card = info?.card ?? null;
  const pbi = info?.pbi ?? null;
  const pode = !!info?.podeMovimentar;
  const etapaAtual = card?.etapa ?? null;
  // Aba padrão = a etapa atual do card (ou a última com movimento, se ele já está na Análise ou além).
  const abaAtiva: AbaEtapa = aba ?? (etapaAtual === "1.1" || etapaAtual === "1.2" || etapaAtual === "2.1" ? etapaAtual : "2.1");
  const abaDef = ABAS.find((a) => a.etapa === abaAtiva)!;

  // O que o usuário alterou no quadro (só os campos que diferem do PBI) e o que isso causaria (regras puras, só para orientar).
  const base = useMemo(() => (pbi ? rascunhoDe(pbi) : null), [pbi]);
  const mudancas = useMemo<EntradaMovimento>(() => {
    if (!base || !rascunho) return {};
    const m: EntradaMovimento = {};
    (Object.keys(base) as Campo[]).forEach((k) => {
      if (rascunho[k] !== base[k]) m[k] = rascunho[k];
    });
    return m;
  }, [base, rascunho]);
  const previa = useMemo(() => (pbi && Object.keys(mudancas).length ? avaliarEdicao(pbi, mudancas) : null), [pbi, mudancas]);
  const alterado = Object.keys(mudancas).length > 0;

  async function salvar() {
    if (!alterado || !previa?.permitido) return;
    setSalvando(true);
    setErroSalvar(null);
    setConflito(null);
    setAviso(null);
    try {
      // `base` = o que a tela mostrava dos campos editados: se outra pessoa já mudou algum deles no Azure, o servidor recusa (409).
      const baseDosCampos: EntradaMovimento = {};
      (Object.keys(mudancas) as Campo[]).forEach((k) => {
        baseDosCampos[k] = base?.[k] ?? "";
      });
      const res = await fetch(`/api/fluxo-po/pbi/${encodeURIComponent(id)}/informacoes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrada: mudancas, base: baseDosCampos }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409: o rascunho do usuário é mantido (ele escolhe entre atualizar e descartar ou continuar editando).
        if (res.status === 409) setConflito({ mensagem: j.erro ?? "O PBI foi alterado por outra pessoa.", faltas: j.faltas ?? [] });
        else setErroSalvar({ mensagem: j.erro ?? "Não foi possível salvar.", faltas: j.faltas ?? [] });
        return;
      }
      setInfo((atual) => (atual ? { ...atual, pbi: j.pbi, card: j.card } : atual));
      setRascunho(rascunhoDe(j.pbi));
      setRevBase(j.pbi.rev);
      setMudouNoAzure(null);
      const resumo: string[] = (j.alteracoes as Alteracao[]).map((a) => `${a.rotulo}: ${valorLegivelDaAlteracao(a.campo, a.de)} → ${valorLegivelDaAlteracao(a.campo, a.para)}`);
      const copiados = j.assesments ? j.assesments.atualizados.length + j.assesments.jaIguais.length : 0;
      if (copiados > 0) resumo.push(`Data Comitê copiada para ${copiados} Assesment(s) filho(s).`);
      setAviso({ tipo: "ok", titulo: j.semMudancas ? "Nada mudou" : "Informações gravadas no PBI do Azure DevOps", linhas: [...(j.semMudancas ? [] : resumo), ...(j.avisos ?? [])] });
    } catch {
      setErroSalvar({ mensagem: "Não foi possível falar com o servidor. Nada foi confirmado; tente de novo.", faltas: [] });
    } finally {
      setSalvando(false);
    }
  }

  if (carregando && !info) return <p style={{ color: C.muted }}>Carregando o PBI do Azure DevOps…</p>;
  if (erro || !info || !pbi || !rascunho) {
    return (
      <div>
        <Voltar />
        <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>{erro ?? "Não foi possível carregar o PBI."}</div>
      </div>
    );
  }

  const prio = pbi.prioridade !== null && pbi.prioridade >= 1 && pbi.prioridade <= 4 ? infoPrioridade(pbi.prioridade) : null;
  const dias = agingEmDias(pbi, hoje);
  const diaComite = chaveDia(pbi.dataComite);
  const atrasada = etapaAtual === "2.1" && comiteAtrasado(pbi.dataComite, hoje);
  const proximo = etapaAtual ? destinosPossiveis(etapaAtual).find((d) => d.direcao === "avanco") : undefined;

  return (
    <div>
      <Voltar />

      {/* Cabeçalho */}
      <div className="kmm-card" style={{ padding: "16px 20px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <a href={urlPbiAzure(pbi.id)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: C.muted, textDecoration: "none" }}>
                #{pbi.id}
              </a>
              {etapaAtual ? (
                <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "2px 11px", background: COR_DA_ETAPA[etapaAtual].bg, color: COR_DA_ETAPA[etapaAtual].dot }}>
                  Etapa atual: {rotuloDaEtapa(etapaAtual)}
                </span>
              ) : (
                <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "2px 11px", background: C.soft, color: C.muted }}>Fora do Fluxo do PO</span>
              )}
              {prio && <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "2px 10px", background: prio.bg, color: prio.fg }}>{prio.label}</span>}
            </div>
            <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 21, lineHeight: 1.3, margin: "8px 0 0", color: C.text }}>{pbi.titulo}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, fontSize: 12.5, color: C.muted }}>
              {pbi.cliente && <span style={{ background: PASTEL.sky.bg, borderRadius: 7, padding: "2px 9px", color: C.text }}>{pbi.cliente}</span>}
              <span style={{ background: C.soft, borderRadius: 7, padding: "2px 9px" }}>{rotuloDaArea(pbi.areaPath)}</span>
              {dias !== null && (
                <span title="Hoje menos a Data Abertura Produto" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: agingEmAlerta(dias) ? C.red : C.muted, fontWeight: agingEmAlerta(dias) ? 600 : 500 }}>
                  <Clock size={12} /> {dias} dias de aging
                </span>
              )}
              {etapaAtual === "2.1" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: atrasada ? C.red : C.muted, fontWeight: atrasada ? 600 : 500 }}>
                  {atrasada ? <AlertTriangle size={12} /> : <CalendarDays size={12} />} Comitê {diaComite ? formatarChaveDia(diaComite) : "sem data"}
                  {atrasada && " (atrasada)"}
                </span>
              )}
            </div>
          </div>
          <a href={urlPbiAzure(pbi.id)} target="_blank" rel="noopener noreferrer" className="kmm-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            Abrir no Azure DevOps <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Etapas (uma aba por etapa) */}
      <div role="tablist" aria-label="Etapas do fluxo" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {ABAS.map((a) => {
          const ativa = a.etapa === abaAtiva;
          const idxAtual = etapaAtual ? ORDEM.indexOf(etapaAtual) : -1;
          const concluida = idxAtual > ORDEM.indexOf(a.etapa);
          const atual = etapaAtual === a.etapa;
          const cor = COR_DA_ETAPA[a.etapa];
          return (
            <button
              key={a.etapa}
              role="tab"
              type="button"
              aria-selected={ativa}
              onClick={() => setAba(a.etapa)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: ativa ? 700 : 500,
                padding: "9px 16px",
                borderRadius: 12,
                cursor: "pointer",
                border: `1.5px solid ${ativa ? cor.dot : C.border}`,
                background: ativa ? cor.bg : "#fff",
                color: ativa ? C.text : C.muted,
              }}
            >
              <span style={{ width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: concluida ? PASTEL.green.dot : atual ? cor.dot : C.soft, color: concluida || atual ? "#fff" : C.faint, fontSize: 10, flexShrink: 0 }}>
                {concluida ? <Check size={11} /> : atual ? "●" : ""}
              </span>
              {a.titulo}
              {atual && <span style={{ fontSize: 10.5, fontWeight: 600, color: cor.dot }}>atual</span>}
            </button>
          );
        })}
      </div>

      {/* Faixa de prontidão (da etapa atual do card) */}
      <FaixaDeProntidao card={card} etapaAtual={etapaAtual} pode={pode} aoMover={() => setMovendo(true)} temDestino={!!proximo || (etapaAtual ? destinosPossiveis(etapaAtual).length > 0 : false)} />

      {/* T19: o PBI mudou no Azure DevOps enquanto a tela estava aberta */}
      {mudouNoAzure && !conflito && (
        <div role="alert" style={{ margin: "12px 0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: PASTEL.amber.bg, border: "1px solid #F6DDB5", color: "#8a5a00", borderRadius: 12, padding: "11px 16px", fontSize: 13 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong>Este PBI foi alterado no Azure DevOps</strong>
            {mudouNoAzure.por ? ` por ${mudouNoAzure.por}` : ""}
            {mudouNoAzure.em ? ` às ${new Date(mudouNoAzure.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}, depois que você abriu a tela.
            {alterado && " Você tem alterações não salvas: atualizar as descarta."}
          </div>
          <button type="button" className="kmm-btn" onClick={() => setRecarga((n) => n + 1)} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.text }}>
            <RefreshCw size={14} /> {alterado ? "Atualizar e descartar minhas alterações" : "Atualizar agora"}
          </button>
          <button type="button" className="kmm-btn" onClick={() => { setRevBase(mudouNoAzure.rev); setMudouNoAzure(null); }} style={{ color: C.text }}>
            Ignorar
          </button>
        </div>
      )}
      {conflito && (
        <div role="alert" style={{ margin: "12px 0", background: "#FDF1F0", border: "1px solid #F3C9C4", color: C.red, borderRadius: 12, padding: "12px 16px", fontSize: 13 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            <AlertTriangle size={16} /> Não salvei: o PBI mudou no Azure DevOps
          </div>
          <div style={{ marginTop: 4, color: C.text }}>{conflito.mensagem}</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: C.text }}>
            {conflito.faltas.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className="kmm-btn" onClick={() => setRecarga((n) => n + 1)} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.text }}>
              <RefreshCw size={14} /> Atualizar e descartar minhas alterações
            </button>
            <button type="button" className="kmm-btn" onClick={() => setConflito(null)} style={{ color: C.text }}>
              Continuar editando
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <div role="status" className="kmm-card" style={{ margin: "12px 0", fontSize: 13, display: "flex", alignItems: "flex-start", gap: 10, background: aviso.tipo === "ok" ? PASTEL.green.bg : "#FDF1F0", borderColor: aviso.tipo === "ok" ? "#CFE9D8" : "#F3C9C4" }}>
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

      {/* Informações da etapa (editáveis) */}
      <div role="tabpanel" aria-label={`Informações da etapa ${abaDef.titulo}`} className="kmm-card" style={{ padding: "18px 20px", marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 15, color: C.text }}>Informações da etapa</div>
          {!pode && (
            <span title={info.permissao.motivo ?? ""} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.muted, background: C.soft, borderRadius: 999, padding: "2px 10px" }}>
              <Lock size={12} /> Somente visualização
            </span>
          )}
        </div>
        <p style={{ margin: "4px 0 14px", fontSize: 12.5, color: C.muted }}>{abaDef.dica}</p>
        {info.listas.aviso && <div style={{ marginBottom: 12, fontSize: 12.5, color: "#8a5a00", background: "#fff6e0", borderRadius: 8, padding: "7px 10px" }}>{info.listas.aviso}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {abaDef.campos.map((campo) => (
            <CampoInformacao
              key={campo}
              campo={campo}
              valor={rascunho[campo]}
              original={base?.[campo] ?? ""}
              editavel={pode}
              listas={info.listas}
              aoMudar={(v) => {
                setRascunho((r) => (r ? { ...r, [campo]: v } : r));
                setErroSalvar(null);
              }}
            />
          ))}
        </div>

        {previa && previa.avisos.map((a) => (
          <div key={a} style={{ marginTop: 12, fontSize: 12.5, color: "#8a5a00", background: "#fff6e0", borderRadius: 8, padding: "7px 10px" }}>{a}</div>
        ))}
        {previa && !previa.permitido && (
          <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: C.red, background: "#FDF1F0", borderRadius: 8, padding: "7px 10px" }}>
            {previa.faltas.map((f) => (
              <div key={f}>{f}</div>
            ))}
          </div>
        )}
        {erroSalvar && (
          <div role="alert" style={{ marginTop: 12, fontSize: 13, color: C.red, background: "#FDF1F0", borderRadius: 8, padding: "9px 12px" }}>
            <div style={{ fontWeight: 600 }}>{erroSalvar.mensagem}</div>
            {erroSalvar.faltas.map((f) => (
              <div key={f} style={{ marginTop: 3 }}>{f}</div>
            ))}
          </div>
        )}

        {pode && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              className="kmm-btn"
              onClick={salvar}
              disabled={!alterado || !previa?.permitido || salvando}
              style={{ background: alterado && previa?.permitido ? C.orange : C.soft, color: alterado && previa?.permitido ? "#fff" : C.faint, borderColor: alterado && previa?.permitido ? C.orange : C.border, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7, cursor: alterado && previa?.permitido && !salvando ? "pointer" : "not-allowed" }}
            >
              {salvando && <Loader2 size={14} style={{ animation: "kmm-giro 1s linear infinite" }} />}
              {salvando ? "Gravando…" : "Salvar informações"}
            </button>
            <button type="button" className="kmm-btn" onClick={() => { setRascunho(base); setErroSalvar(null); }} disabled={!alterado || salvando}>
              Descartar alterações
            </button>
            <span style={{ fontSize: 12, color: C.muted }}>{alterado ? `${Object.keys(mudancas).length} campo(s) alterado(s), ainda não gravado(s)` : "Nada alterado"}</span>
          </div>
        )}
        {!pode && <p style={{ margin: "14px 0 0", fontSize: 12, color: C.muted }}>{info.permissao.motivo ?? `Movimentam: ${QUEM_MOVIMENTA}.`}</p>}
        <style>{"@keyframes kmm-giro{to{transform:rotate(360deg)}}"}</style>
      </div>

      {/* Checklist, descrição, comentários, anexos, histórico e os quadros "Quando avança" / "Ao avançar" (T17) */}
      <FluxoPoDetalheBlocos id={pbi.id} aba={abaAtiva} pode={pode} motivoSemPermissao={info.permissao.motivo} versao={pbi.rev} aoPublicarComentario={reajustarRevisao} />

      {movendo && card && proximo && (
        <FluxoPoMoverDialog
          card={card}
          destinoInicial={proximo.destino}
          onFechar={() => setMovendo(false)}
          onConcluido={(r) => {
            setMovendo(false);
            setAviso({ tipo: "ok", titulo: `Card movido${r.origem ? `: ${rotuloDaEtapa(r.origem)} → ${rotuloDaEtapa(r.destino)}` : ""}`, linhas: r.avisos });
            setAba(null);
            setRecarga((n) => n + 1);
          }}
          onConflito={() => {
            setMovendo(false);
            setRecarga((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

function Voltar() {
  return (
    <Link href="/fluxo-po" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: C.muted, textDecoration: "none", marginBottom: 12 }}>
      <ArrowLeft size={14} /> Voltar ao quadro do Fluxo do PO
    </Link>
  );
}

/** Faixa que diz se o card está pronto para a próxima etapa ou o que falta (e dá o botão de mover, quando pode). */
function FaixaDeProntidao({ card, etapaAtual, pode, aoMover, temDestino }: { card: CardFluxo | null; etapaAtual: EtapaFluxo | null; pode: boolean; aoMover: () => void; temDestino: boolean }) {
  let corpo: React.ReactNode;
  let cor = { bg: C.soft, fg: C.muted, borda: C.border };
  if (!card || !etapaAtual) {
    corpo = <span>Este PBI não está em nenhuma etapa do Fluxo do PO (Status e Etapa fora das regras do quadro).</span>;
  } else if (card.inconsistencia) {
    cor = { bg: "#FDF1F0", fg: C.red, borda: "#F3C9C4" };
    corpo = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <AlertTriangle size={16} /> <strong>Inconsistente:</strong> {card.inconsistencia}
      </span>
    );
  } else if (!card.prontidao) {
    corpo = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Eye size={16} /> Etapa {rotuloDaEtapa(etapaAtual)}: somente exibição nesta fase (sem regras de movimento).
      </span>
    );
  } else if (card.prontidao.pronto) {
    cor = { bg: PASTEL.green.bg, fg: "#1f7a47", borda: "#CFE9D8" };
    corpo = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <CheckCircle2 size={16} /> <strong>Pronto para mover</strong> — o card já cumpre a regra para avançar.
      </span>
    );
  } else {
    cor = { bg: PASTEL.amber.bg, fg: "#8a5a00", borda: "#F6DDB5" };
    corpo = (
      <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 8 }}>
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span title={card.prontidao.faltas.join("\n")}>
          <strong>Falta:</strong> {card.prontidao.faltas.map(resumirFalta).join(", ")}
        </span>
      </span>
    );
  }
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: cor.bg, color: cor.fg, border: `1px solid ${cor.borda}`, borderRadius: 12, padding: "11px 16px", fontSize: 13 }}>
      <div style={{ flex: 1, minWidth: 220 }}>{corpo}</div>
      {pode && card?.prontidao && temDestino && (
        <button type="button" className="kmm-btn" onClick={aoMover} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.text }}>
          <MoveRight size={14} /> Mover card…
        </button>
      )}
    </div>
  );
}

/** Um campo do quadro: lista do Azure (Cliente com busca, Classificação, esteiras), data ou texto; somente leitura se não puder editar. */
function CampoInformacao({
  campo,
  valor,
  original,
  editavel,
  listas,
  aoMudar,
}: {
  campo: Campo;
  valor: string;
  original: string;
  editavel: boolean;
  listas: Listas;
  aoMudar: (v: string) => void;
}) {
  const alterado = valor !== original;
  const rotulo = ROTULO_CAMPO[campo];
  const ehData = campo === "dataAberturaProduto" || campo === "dataComite";

  let leitura = valor || "—";
  if (ehData && valor) leitura = formatarChaveDia(valor);
  if (campo === "areaPath") leitura = rotuloDaArea(valor);

  let controle: React.ReactNode;
  if (!editavel) {
    controle = <div style={{ fontSize: 14, color: valor ? C.text : C.faint, padding: "8px 0" }}>{leitura}</div>;
  } else if (campo === "cliente") {
    // Valor atual fora da lista do Azure (legado) continua selecionável, para não sumir do campo.
    const opcoes = valor && !listas.clientes.includes(valor) ? [valor, ...listas.clientes] : listas.clientes;
    controle = (
      <div>
        <MultiSelectFiltro rotuloTodos="Selecione o cliente" opcoes={opcoes} selecionados={valor ? [valor] : []} onChange={(v) => aoMudar(v[0] ?? "")} pesquisavel unico placeholderBusca="Digite o nome do cliente…" />
        {valor && (
          <button type="button" onClick={() => aoMudar("")} style={{ marginTop: 4, border: "none", background: "transparent", color: C.muted, fontSize: 11.5, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
            Limpar cliente
          </button>
        )}
      </div>
    );
  } else if (campo === "classificacao") {
    const opcoes = valor && !listas.classificacoes.includes(valor) ? [valor, ...listas.classificacoes] : listas.classificacoes;
    controle = (
      <select className="kmm-input" value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">— sem classificação —</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  } else if (campo === "areaPath") {
    const raiz = { valor: "KMM5", rotulo: "KMM5 (sem esteira)" };
    const opcoes = [raiz, ...listas.esteiras];
    const conhecida = opcoes.some((o) => o.valor === valor);
    controle = (
      <select className="kmm-input" value={valor} onChange={(e) => aoMudar(e.target.value)}>
        {!conhecida && <option value={valor}>{valor}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>{o.rotulo}</option>
        ))}
      </select>
    );
  } else {
    controle = <input className="kmm-input" type="date" value={valor} onChange={(e) => aoMudar(e.target.value)} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".03em" }}>{rotulo}</span>
        {alterado && <span style={{ fontSize: 10.5, fontWeight: 600, color: C.orange, background: "#FFF1EA", borderRadius: 999, padding: "0 7px" }}>alterado</span>}
      </div>
      {controle}
    </div>
  );
}

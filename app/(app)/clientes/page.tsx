"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProduto } from "@/components/ProdutoContext";
import { C } from "@/lib/kmm-theme";
import PageHeader from "@/components/PageHeader";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import { nomeCurtoDaSquad } from "@/lib/backlog";
import {
  calcularIndicadoresGestao,
  ordemDoStatus,
  type PbiGestaoCliente,
  type UltimoComentario,
} from "@/lib/gestao-clientes";

// Gestão de clientes (reformulada em 2026-10-17): lista de PBIs do Azure DevOps no formato da
// planilha de acompanhamento + 3 indicadores. A tabela "Cliente" do banco e a API /api/clientes
// continuam existindo, mas não alimentam mais esta tela.

const SEM_CLIENTE = "Sem cliente";
const TAMANHO_LOTE_COMENTARIOS = 40;
const LOTES_EM_PARALELO = 3;
const ORG_DEVOPS = "kmmbynstech";

/** Cor do chip de cada status do board (paleta do app; um tom por status). */
const COR_STATUS: Record<string, { bg: string; fg: string }> = {
  backlog: { bg: C.soft, fg: C.muted },
  orcamento: { bg: "#E7F0FA", fg: C.blue },
  execucao: { bg: "#FFF1EA", fg: C.orange },
  "teste aceite usuario": { bg: "#FCEFD8", fg: C.amber },
  "aguardando deploy": { bg: "#E7F5EC", fg: C.green },
};
function corDoStatus(state: string) {
  const chave = state.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return COR_STATUS[chave] ?? { bg: C.soft, fg: C.muted };
}

export default function ClientesPage() {
  const { produto } = useProduto();
  const [itens, setItens] = useState<PbiGestaoCliente[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [clientesSel, setClientesSel] = useState<string[]>([]);
  // Observação (último comentário) chega depois da tabela, em lotes: id → comentário | null.
  const [comentarios, setComentarios] = useState<Record<number, UltimoComentario | null>>({});
  const geracao = useRef(0);

  useEffect(() => {
    const minha = ++geracao.current;
    setCarregando(true);
    setErro(null);
    setComentarios({});
    (async () => {
      try {
        const res = await fetch(`/api/clientes/pbis?produto=${produto}`, { cache: "no-store" });
        const j = await res.json();
        if (minha !== geracao.current) return;
        if (!res.ok) throw new Error(j.erro ?? "Falha ao carregar os PBIs.");
        const lista: PbiGestaoCliente[] = j.itens ?? [];
        setItens(lista);
        setAvisos(j.avisos ?? []);
        setCarregando(false);
        carregarComentarios(lista, minha);
      } catch (e: any) {
        if (minha !== geracao.current) return;
        setErro(e.message ?? "Falha ao carregar os PBIs.");
        setItens([]);
        setCarregando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto]);

  /** Busca o último comentário só dos PBIs que têm comentário, em lotes pequenos e poucos em paralelo. */
  async function carregarComentarios(lista: PbiGestaoCliente[], minha: number) {
    const fila = lista.filter((p) => p.qtdComentarios > 0).map((p) => ({ id: p.id, projeto: p.projeto }));
    const lotes: { id: number; projeto: string }[][] = [];
    for (let i = 0; i < fila.length; i += TAMANHO_LOTE_COMENTARIOS) lotes.push(fila.slice(i, i + TAMANHO_LOTE_COMENTARIOS));

    async function trabalhador() {
      for (let lote = lotes.shift(); lote; lote = lotes.shift()) {
        if (minha !== geracao.current) return;
        let recebidos: Record<number, UltimoComentario | null> = {};
        try {
          const res = await fetch("/api/clientes/pbis/comentarios", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itens: lote }),
          });
          recebidos = (await res.json()).comentarios ?? {};
        } catch {
          // lote falhou: os itens ficam sem observação ("—") em vez de "carregando" pra sempre
        }
        if (minha !== geracao.current) return;
        const completos = { ...recebidos };
        for (const it of lote) if (!(it.id in completos)) completos[it.id] = null;
        setComentarios((atual) => ({ ...atual, ...completos }));
      }
    }
    await Promise.all(Array.from({ length: Math.min(LOTES_EM_PARALELO, lotes.length) }, trabalhador));
  }

  const clienteDe = (p: PbiGestaoCliente) => p.cliente || SEM_CLIENTE;
  const opcoesCliente = useMemo(() => Array.from(new Set(itens.map(clienteDe))).sort((a, b) => a.localeCompare(b, "pt-BR")), [itens]);

  // Se a lista de clientes mudar (troca de produto), descarta seleções que não existem mais.
  useEffect(() => {
    setClientesSel((sel) => sel.filter((c) => opcoesCliente.includes(c)));
  }, [opcoesCliente]);

  const visiveis = useMemo(() => {
    const filtrados = clientesSel.length ? itens.filter((p) => clientesSel.includes(clienteDe(p))) : itens;
    return [...filtrados].sort((a, b) => ordemDoStatus(a.state) - ordemDoStatus(b.state) || a.id - b.id);
  }, [itens, clientesSel]);

  const ind = useMemo(() => calcularIndicadoresGestao(visiveis), [visiveis]);
  const valor = (v: number | null) => (carregando ? "…" : v == null ? "—" : String(v));

  return (
    <div>
      <PageHeader
        titulo="Gestão de clientes"
        subtitulo="PBIs do Azure DevOps em Backlog, Orçamento, Execução, Teste Aceite Usuário e Aguardando Deploy."
      >
        <MultiSelectFiltro rotuloTodos="Todos os clientes" opcoes={opcoesCliente} selecionados={clientesSel} onChange={setClientesSel} />
      </PageHeader>

      {erro && <div className="kmm-card" style={{ marginBottom: 16, fontSize: 13, color: C.red }}>{erro}</div>}
      {avisos.map((a) => (
        <div key={a} className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: "#8a5a00", background: "#fff6e0" }}>{a}</div>
      ))}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <KpiCard titulo="DEMANDAS EM BACKLOG" valor={valor(ind.demandasBacklog)} nota="Backlog nas etapas Backlog, Análise ou Comitê" />
        <KpiCard titulo="DEMANDAS EM ETAPA COMERCIAL" valor={valor(ind.demandasEtapaComercial)} nota="Orçamento + Backlog na etapa Relacionamento Comercial" />
        <KpiCard titulo="AGGING DE VIABILIDADE" valor={valor(ind.agingViabilidadeDias)} unidade="dias" nota="Idade média dos itens em Backlog (sem KMM INTERNO)" />
      </div>

      <div className="kmm-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr style={{ textAlign: "left", background: C.dark }}>
                {["Chamado", "Tarefa", "PBI", "Status no board", "Etapa", "PO", "Esteira", "Observação"].map((h) => (
                  <th key={h} style={{ padding: "11px 14px", fontSize: 12.5, color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr><td style={{ padding: 18, color: C.muted }} colSpan={8}>Carregando…</td></tr>
              ) : visiveis.length === 0 ? (
                <tr><td style={{ padding: 18, color: C.muted }} colSpan={8}>Nenhum PBI encontrado para os filtros atuais.</td></tr>
              ) : (
                visiveis.map((p, i) => {
                  const cor = corDoStatus(p.state);
                  const com = comentarios[p.id];
                  const aguardandoComentario = p.qtdComentarios > 0 && com === undefined;
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 ? "#FAF9F7" : "#fff", fontSize: 13.5, verticalAlign: "top" }}>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{p.idExterno || "—"}</td>
                      <td style={{ padding: "10px 14px", minWidth: 260 }}>{p.titulo}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <a
                          href={`https://dev.azure.com/${ORG_DEVOPS}/${encodeURIComponent(p.projeto)}/_workitems/edit/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: C.blue, textDecoration: "none", fontWeight: 600 }}
                        >
                          {p.id}
                        </a>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span className="kmm-chip" style={{ background: cor.bg, color: cor.fg, borderColor: "transparent" }}>{p.state}</span>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{p.etapa || "—"}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{p.po || "—"}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{nomeCurtoDaSquad(p.areaPath) || "—"}</td>
                      <td style={{ padding: "10px 14px", minWidth: 260, color: com?.texto ? C.text : C.faint }} title={com ? `${com.autor}${com.data ? " · " + new Date(com.data).toLocaleDateString("pt-BR") : ""}` : undefined}>
                        {aguardandoComentario ? "…" : com?.texto ? (
                          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{com.texto}</span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {!carregando && visiveis.length > 0 && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>{visiveis.length} PBI(s) na visão.</div>
      )}
    </div>
  );
}

function KpiCard({ titulo, valor, unidade, nota }: { titulo: string; valor: string; unidade?: string; nota?: string }) {
  return (
    <div className="kmm-card">
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: ".04em" }}>{titulo}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: C.text, marginTop: 6 }}>
        {valor}
        {unidade && valor !== "—" && valor !== "…" && <span style={{ fontSize: 14, fontWeight: 500, color: C.muted }}> {unidade}</span>}
      </div>
      {nota && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>{nota}</div>}
    </div>
  );
}

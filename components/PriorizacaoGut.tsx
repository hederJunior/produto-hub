"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { useProduto } from "@/components/ProdutoContext";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import { C } from "@/lib/kmm-theme";
import { formatarChaveDia, chaveDia } from "@/lib/datas";
import {
  AVALIACAO_VAZIA,
  ESCALAS_GUT,
  FAIXAS_GUT,
  NOTA_MAX,
  NOTA_MIN,
  ORIENTACOES_GUT,
  STATUS_AVALIACAO,
  faixaDaPontuacao,
  pontuacaoGut,
  resumoGut,
  type AvaliacaoGut,
  type ItemGut,
  type StatusAvaliacao,
} from "@/lib/priorizacao-gut";

/**
 * Backlog > Priorização GUT (pedido por Heder em 2026-10-19): recriação da planilha
 * "Priorizacao_GUT_Debitos_Tecnicos.xlsx" para PBIs em Backlog da área SWAT (KMM5).
 * Colunas A–K = Azure DevOps (leitura); G/U/T, justificativa, ação e status = squad (só admin edita,
 * salvo em PriorizacaoGut); pontuação e prioridade = calculadas. Regras em lib/priorizacao-gut.ts.
 */

const ORG_DEVOPS = "kmmbynstech";
const SEM_CLIENTE = "Sem cliente";
const SEM_PONTUACAO = "Sem pontuação";
const NOTAS = Array.from({ length: NOTA_MAX - NOTA_MIN + 1 }, (_, i) => NOTA_MIN + i);

// Cores do cabeçalho por origem da coluna (legenda da planilha: cinza = Azure, amarelo = squad, azul = calculada).
const COR_AZURE = { head: C.dark, cel: "#F6F5F3" };
const COR_SQUAD = { head: "#B7791F", cel: "#FFFBEA" };
const COR_CALC = { head: C.blue, cel: "#EAF2FB" };

type Coluna = { titulo: string; largura: number; origem: typeof COR_AZURE };
const COLUNAS: Coluna[] = [
  { titulo: "ID", largura: 72, origem: COR_AZURE },
  { titulo: "Title", largura: 320, origem: COR_AZURE },
  { titulo: "Work Item Type", largura: 130, origem: COR_AZURE },
  { titulo: "Assigned To", largura: 170, origem: COR_AZURE },
  { titulo: "State", largura: 86, origem: COR_AZURE },
  { titulo: "Tags", largura: 150, origem: COR_AZURE },
  { titulo: "Cliente", largura: 130, origem: COR_AZURE },
  { titulo: "Board Column", largura: 150, origem: COR_AZURE },
  { titulo: "Classificação", largura: 150, origem: COR_AZURE },
  { titulo: "Data Comitê", largura: 110, origem: COR_AZURE },
  { titulo: "Data Abertura Produto", largura: 130, origem: COR_AZURE },
  { titulo: "G — Gravidade", largura: 86, origem: COR_SQUAD },
  { titulo: "U — Urgência", largura: 86, origem: COR_SQUAD },
  { titulo: "T — Tendência", largura: 86, origem: COR_SQUAD },
  { titulo: "Pontuação GUT", largura: 96, origem: COR_CALC },
  { titulo: "Prioridade GUT", largura: 120, origem: COR_CALC },
  { titulo: "Justificativa da avaliação", largura: 320, origem: COR_SQUAD },
  { titulo: "Ação recomendada", largura: 260, origem: COR_SQUAD },
  { titulo: "Status da avaliação", largura: 170, origem: COR_SQUAD },
];

function dataPura(iso: string | null): string {
  return iso ? formatarChaveDia(iso.slice(0, 10)) : "—";
}
function dataDoInstante(iso: string | null): string {
  return iso ? formatarChaveDia(chaveDia(iso)) : "—";
}

type EstadoSalvar = "salvando" | "ok" | "erro";

export default function PriorizacaoGut() {
  const { produto } = useProduto();
  const [itens, setItens] = useState<ItemGut[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Record<number, AvaliacaoGut>>({});
  const [podeEditar, setPodeEditar] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [estadoSalvar, setEstadoSalvar] = useState<Record<number, EstadoSalvar>>({});
  const [criteriosAberto, setCriteriosAberto] = useState(false);

  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [prioridadeSel, setPrioridadeSel] = useState<string[]>([]);
  const [clientesSel, setClientesSel] = useState<string[]>([]);
  const [ordenarPorPontuacao, setOrdenarPorPontuacao] = useState(false);

  const avalRef = useRef(avaliacoes);
  avalRef.current = avaliacoes;

  // A área SWAT só existe no KMM5 (decisão de Heder): com KMM4 selecionado não há o que carregar.
  const semSwat = produto === "KMM4";

  useEffect(() => {
    if (semSwat) {
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    fetch("/api/priorizacao-gut", { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (cancelado) return;
        if (j.erro) setErro(j.erro);
        setItens(j.itens ?? []);
        setAvaliacoes(j.avaliacoes ?? {});
        setPodeEditar(Boolean(j.podeEditar));
        setAvisos(j.avisos ?? []);
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar a Priorização SWAT."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [semSwat]);

  const avaliacaoDe = (id: number): AvaliacaoGut => avaliacoes[id] ?? AVALIACAO_VAZIA;

  function editar(id: number, patch: Partial<AvaliacaoGut>) {
    setAvaliacoes((atual) => ({ ...atual, [id]: { ...(atual[id] ?? AVALIACAO_VAZIA), ...patch } }));
  }

  /** Grava a avaliação atual do item (lida do ref, pra pegar o valor mais novo mesmo logo após editar()). */
  async function salvar(id: number, sobrescrever?: Partial<AvaliacaoGut>) {
    const a = { ...(avalRef.current[id] ?? AVALIACAO_VAZIA), ...sobrescrever };
    setEstadoSalvar((e) => ({ ...e, [id]: "salvando" }));
    try {
      const res = await fetch("/api/priorizacao-gut/avaliacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItemId: id, gravidade: a.gravidade, urgencia: a.urgencia, tendencia: a.tendencia, justificativa: a.justificativa, acao: a.acao, status: a.status }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.erro ?? "Falha ao salvar.");
      setEstadoSalvar((e) => ({ ...e, [id]: "ok" }));
      editar(id, { atualizadoPor: j.atualizadoPor, atualizadoEm: j.atualizadoEm });
    } catch {
      setEstadoSalvar((e) => ({ ...e, [id]: "erro" }));
    }
  }

  /** Select (G/U/T e status): muda e grava na hora. */
  function mudarEGravar(id: number, patch: Partial<AvaliacaoGut>) {
    editar(id, patch);
    salvar(id, patch);
  }

  const resumo = useMemo(() => resumoGut(itens, avaliacoes), [itens, avaliacoes]);
  const clienteDe = (i: ItemGut) => i.cliente || SEM_CLIENTE;
  const opcoesCliente = useMemo(() => Array.from(new Set(itens.map(clienteDe))).sort((a, b) => a.localeCompare(b, "pt-BR")), [itens]);

  const visiveis = useMemo(() => {
    let lista = itens.filter((i) => {
      const a = avaliacoes[i.id] ?? AVALIACAO_VAZIA;
      if (statusSel.length && !statusSel.includes(a.status)) return false;
      if (clientesSel.length && !clientesSel.includes(clienteDe(i))) return false;
      if (prioridadeSel.length) {
        const f = faixaDaPontuacao(pontuacaoGut(a));
        if (!prioridadeSel.includes(f?.codigo ?? SEM_PONTUACAO)) return false;
      }
      return true;
    });
    if (ordenarPorPontuacao) {
      // Ordem estável (empates mantêm o ID): maior pontuação primeiro, sem pontuação no fim — como na planilha.
      lista = [...lista].sort((a, b) => (pontuacaoGut(avaliacoes[b.id] ?? AVALIACAO_VAZIA) ?? -1) - (pontuacaoGut(avaliacoes[a.id] ?? AVALIACAO_VAZIA) ?? -1));
    }
    return lista;
  }, [itens, avaliacoes, statusSel, clientesSel, prioridadeSel, ordenarPorPontuacao]);

  if (semSwat) {
    return <p style={{ color: C.muted }}>A área SWAT existe apenas no KMM5. Selecione KMM5 ou Ambos no topo da página para ver a Priorização SWAT.</p>;
  }

  const controleBase = { fontFamily: "inherit", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, background: "#fff", color: C.text, padding: "5px 7px" } as const;

  return (
    <div>
      {/* Barra de filtros/ações */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <MultiSelectFiltro rotuloTodos="Todos os status" opcoes={[...STATUS_AVALIACAO]} selecionados={statusSel} onChange={setStatusSel} />
        <MultiSelectFiltro rotuloTodos="Todas as prioridades" opcoes={[...FAIXAS_GUT.map((f) => f.codigo), SEM_PONTUACAO]} selecionados={prioridadeSel} onChange={setPrioridadeSel} />
        <MultiSelectFiltro rotuloTodos="Todos os clientes" opcoes={opcoesCliente} selecionados={clientesSel} onChange={setClientesSel} />
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <button
            className="kmm-btn"
            aria-pressed={ordenarPorPontuacao}
            style={ordenarPorPontuacao ? { borderColor: C.orange, color: C.orange, background: "#FFF1EA" } : undefined}
            onClick={() => setOrdenarPorPontuacao((v) => !v)}
          >
            Ordenar por pontuação
          </button>
          <button className="kmm-btn" onClick={() => setCriteriosAberto(true)}>
            <BookOpen size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Critérios GUT
          </button>
        </div>
      </div>

      {erro && <div className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: C.red }}>{erro}</div>}
      {avisos.map((a) => (
        <div key={a} className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: "#8a5a00", background: "#fff6e0" }}>{a}</div>
      ))}

      {carregando ? (
        <p style={{ color: C.muted }}>Carregando PBIs da área SWAT no Azure DevOps…</p>
      ) : itens.length === 0 ? (
        !erro && <p style={{ color: C.muted }}>Nenhum PBI em Backlog na área SWAT.</p>
      ) : (
        <>
          {/* Resumo (aba "Resumo" da planilha) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 14 }}>
            <Tile titulo="DÉBITOS NA ÁREA SWAT" valor={String(resumo.total)} />
            <Tile titulo="AVALIADOS (3 NOTAS)" valor={String(resumo.avaliados)} />
            <Tile titulo="PENDENTES" valor={String(resumo.pendentes)} />
            <Tile titulo="% AVALIADOS" valor={`${Math.round(resumo.percentualAvaliados * 100)}%`} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginRight: 4 }}>POR PRIORIDADE</span>
            {resumo.porPrioridade.map((p) => {
              const f = FAIXAS_GUT.find((x) => x.codigo === p.codigo)!;
              return (
                <span key={p.codigo} className="kmm-chip" style={{ background: f.bg, color: f.fg, borderColor: "transparent" }}>
                  {p.codigo}: {p.itens}
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginRight: 4 }}>POR STATUS DA AVALIAÇÃO</span>
            {resumo.porStatus.map((s) => (
              <span key={s.status} className="kmm-chip">
                {s.status}: {s.itens}
              </span>
            ))}
          </div>

          {/* Legenda de cores (como na planilha) */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: C.muted, marginBottom: 8 }}>
            <Legenda cor={COR_AZURE.head} texto="Importado do Azure DevOps (somente leitura)" />
            <Legenda cor={COR_SQUAD.head} texto={podeEditar ? "Preenchimento da squad (editável)" : "Preenchimento da squad (edição só para administradores)"} />
            <Legenda cor={COR_CALC.head} texto="Calculado automaticamente" />
          </div>

          <div className="kmm-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflow: "auto", maxHeight: "68vh" }}>
              <table style={{ borderCollapse: "collapse", width: COLUNAS.reduce((s, c) => s + c.largura, 0), tableLayout: "fixed" }}>
                <colgroup>
                  {COLUNAS.map((c) => <col key={c.titulo} style={{ width: c.largura }} />)}
                </colgroup>
                <thead>
                  <tr>
                    {COLUNAS.map((c) => (
                      <th key={c.titulo} style={{ position: "sticky", top: 0, zIndex: 2, background: c.origem.head, color: "#fff", padding: "10px 10px", fontSize: 12, fontWeight: 700, textAlign: "left" }}>
                        {c.titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.length === 0 ? (
                    <tr><td colSpan={COLUNAS.length} style={{ padding: 18, color: C.muted }}>Nenhum item para os filtros atuais.</td></tr>
                  ) : (
                    visiveis.map((i) => {
                      const a = avaliacaoDe(i.id);
                      const pontos = pontuacaoGut(a);
                      const faixa = faixaDaPontuacao(pontos);
                      const est = estadoSalvar[i.id];
                      const td = (bg: string) => ({ padding: "7px 10px", fontSize: 13, background: bg, borderBottom: `1px solid ${C.border}`, verticalAlign: "top" as const });
                      const nota = (campo: "gravidade" | "urgencia" | "tendencia") => (
                        <td key={campo} style={td(COR_SQUAD.cel)}>
                          {podeEditar ? (
                            <select
                              aria-label={campo}
                              value={a[campo] ?? ""}
                              onChange={(e) => mudarEGravar(i.id, { [campo]: e.target.value === "" ? null : Number(e.target.value) })}
                              style={{ ...controleBase, width: "100%", fontWeight: 700, color: "#0000CC" }}
                            >
                              <option value="">—</option>
                              {NOTAS.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          ) : (
                            <span style={{ fontWeight: 700, color: "#0000CC" }}>{a[campo] ?? "—"}</span>
                          )}
                        </td>
                      );
                      return (
                        <tr key={i.id}>
                          <td style={td(COR_AZURE.cel)}>
                            <a href={`https://dev.azure.com/${ORG_DEVOPS}/KMM5/_workitems/edit/${i.id}`} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, fontWeight: 600, textDecoration: "none" }}>
                              {i.id}
                            </a>
                          </td>
                          <td style={td(COR_AZURE.cel)}>{i.titulo}</td>
                          <td style={td(COR_AZURE.cel)}>{i.tipo}</td>
                          <td style={td(COR_AZURE.cel)}>{i.responsavel || "—"}</td>
                          <td style={td(COR_AZURE.cel)}>{i.state}</td>
                          <td style={td(COR_AZURE.cel)}>{i.tags || "—"}</td>
                          <td style={td(COR_AZURE.cel)}>{i.cliente || "—"}</td>
                          <td style={td(COR_AZURE.cel)}>{i.colunaBoard || "—"}</td>
                          <td style={td(COR_AZURE.cel)}>{i.classificacao || "—"}</td>
                          <td style={td(COR_AZURE.cel)}>{dataPura(i.dataComite)}</td>
                          <td style={td(COR_AZURE.cel)}>{dataDoInstante(i.dataAberturaProduto)}</td>
                          {nota("gravidade")}
                          {nota("urgencia")}
                          {nota("tendencia")}
                          <td style={{ ...td(faixa?.bg ?? COR_CALC.cel), color: faixa?.fg, fontWeight: 700 }}>{pontos ?? ""}</td>
                          <td style={{ ...td(faixa?.bg ?? COR_CALC.cel), color: faixa?.fg, fontWeight: 700 }}>{faixa?.codigo ?? ""}</td>
                          <td style={td(COR_SQUAD.cel)}>
                            {podeEditar ? (
                              <textarea
                                rows={2}
                                value={a.justificativa}
                                onChange={(e) => editar(i.id, { justificativa: e.target.value })}
                                onBlur={() => salvar(i.id)}
                                style={{ ...controleBase, width: "100%", resize: "vertical" }}
                              />
                            ) : (
                              a.justificativa || "—"
                            )}
                          </td>
                          <td style={td(COR_SQUAD.cel)}>
                            {podeEditar ? (
                              <textarea
                                rows={2}
                                value={a.acao}
                                onChange={(e) => editar(i.id, { acao: e.target.value })}
                                onBlur={() => salvar(i.id)}
                                style={{ ...controleBase, width: "100%", resize: "vertical" }}
                              />
                            ) : (
                              a.acao || "—"
                            )}
                          </td>
                          <td style={td(COR_SQUAD.cel)}>
                            {podeEditar ? (
                              <select value={a.status} onChange={(e) => mudarEGravar(i.id, { status: e.target.value as StatusAvaliacao })} style={{ ...controleBase, width: "100%" }}>
                                {STATUS_AVALIACAO.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              a.status
                            )}
                            {est && (
                              <div style={{ fontSize: 11, marginTop: 3, color: est === "erro" ? C.red : C.muted }}>
                                {est === "salvando" ? "Salvando…" : est === "ok" ? "Salvo" : "Falha ao salvar — tente de novo"}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>{visiveis.length} de {itens.length} item(ns) na visão.</div>
        </>
      )}

      {criteriosAberto && <ModalCriterios onFechar={() => setCriteriosAberto(false)} />}
    </div>
  );
}

function Tile({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="kmm-card">
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: ".04em" }}>{titulo}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: C.text, marginTop: 6 }}>{valor}</div>
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: cor, display: "inline-block" }} />
      {texto}
    </span>
  );
}

/** Aba "Critérios GUT" da planilha: como a pontuação é calculada, faixas, escalas 1–5 e orientações. */
function ModalCriterios({ onFechar }: { onFechar: () => void }) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Critérios GUT"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
      style={{ position: "fixed", inset: 0, background: "rgba(20,16,12,.45)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto" }}
    >
      <div className="kmm-card" style={{ width: "min(860px, 100%)", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 18 }}>Matriz GUT — critérios, escalas e orientações</div>
          <button className="kmm-btn" onClick={onFechar} aria-label="Fechar"><X size={14} /></button>
        </div>

        <h4 style={{ margin: "14px 0 6px", fontSize: 14 }}>Como a pontuação é calculada</h4>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: C.text, margin: 0 }}>
          Pontuação GUT = Gravidade × Urgência × Tendência. Cada nota é um número inteiro de 1 a 5, portanto a pontuação varia de 1 a 125. Se
          qualquer uma das três notas estiver vazia, a pontuação e a prioridade permanecem vazias e o item continua pendente de avaliação.
          Exemplo: G=4, U=3, T=3 → 4 × 3 × 3 = 36 → P3 — Média.
        </p>

        <h4 style={{ margin: "16px 0 6px", fontSize: 14 }}>Faixas de prioridade (proposta inicial)</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {FAIXAS_GUT.map((f, idx) => {
            const max = idx === 0 ? 125 : FAIXAS_GUT[idx - 1].min - 1;
            return (
              <span key={f.codigo} className="kmm-chip" style={{ background: f.bg, color: f.fg, borderColor: "transparent" }}>
                {f.codigo}: {f.min} a {max}
              </span>
            );
          })}
        </div>

        {ESCALAS_GUT.map((e) => (
          <div key={e.eixo}>
            <h4 style={{ margin: "18px 0 6px", fontSize: 14 }}>{e.titulo}</h4>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {e.niveis.map((n) => (
                  <tr key={n.nota} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px 8px", fontWeight: 700, width: 36 }}>{n.nota}</td>
                    <td style={{ padding: "6px 8px", width: 110, fontWeight: 600 }}>{n.nivel}</td>
                    <td style={{ padding: "6px 8px", color: C.muted }}>{n.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <h4 style={{ margin: "18px 0 6px", fontSize: 14 }}>Orientações para evitar avaliações inconsistentes</h4>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
          {ORIENTACOES_GUT.map((o) => <li key={o}>{o}</li>)}
        </ul>
      </div>
    </div>
  );
}

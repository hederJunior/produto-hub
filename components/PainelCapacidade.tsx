"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { C, corDoDev } from "@/lib/kmm-theme";
import { agruparAlocacoesPorDevSprint, type TarefaParaCapacidade } from "@/lib/capacidade";

/**
 * Tela "Planejamento de capacidade" (Roadmap > Sprints, pedido por Heder em 2026-09-29): painel
 * lateral (estilo drawer) pra alocar devs entre squads e sprints por arrastar-e-soltar, com um
 * roster bootstrapado a partir de Task/Bug reais do Azure DevOps.
 *
 * V1 fixa em produto="KMM5" (pedido explícito: "deve ser feito apenas de KMM5 nesse momento") —
 * independente do produto selecionado no header do resto da tela. Simplificações conhecidas desta
 * primeira versão, registradas aqui pra não serem confundidas com bug:
 * - Sem datas de início/fim de sprint no cabeçalho de cada bloco (só o rótulo, ex. "Sprint 8.16")
 *   — a Azure DevOps só devolve isso via uma chamada extra (work/teamsettings/iterations) que
 *   esta v1 não faz.
 * - "papel" (Frontend/Backend/QA...) fica em branco: não existe esse dado no Azure DevOps, então
 *   não tem como inferir sem cadastro manual (fora do escopo desta v1).
 * - Board mostra as sprints que já têm alguma alocação (>= Sprint inicial) + a própria Sprint
 *   inicial, mesmo vazia.
 */
export default function PainelCapacidade({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const PRODUTO = "KMM5";

  const [devs, setDevs] = useState<{ id: string; nome: string; papel: string | null }[]>([]);
  const [alocacoes, setAlocacoes] = useState<{ id: string; devId: string; sprint: string; squad: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [tarefas, setTarefas] = useState<TarefaParaCapacidade[]>([]);
  const [sprintInicial, setSprintInicial] = useState("");
  const [autoAlocando, setAutoAlocando] = useState(false);

  const dragRef = useRef<{ devId: string; sprintOrigem: string | null } | null>(null);

  function carregarBoard() {
    setCarregando(true);
    setErro(null);
    fetch(`/api/capacidade?produto=${PRODUTO}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (j.erro) setErro(j.erro);
        setDevs(j.devs ?? []);
        setAlocacoes(j.alocacoes ?? []);
      })
      .catch(() => setErro("Não foi possível carregar o planejamento de capacidade."))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    if (!aberto) return;
    carregarBoard();
    fetch(`/api/roadmap/tarefas?produto=${PRODUTO}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setTarefas(j.tarefas ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // Colunas de squad = Area Path real dos Task/Bug carregados (mesma fonte que a aba Sprints usa
  // pro filtro de área), em vez da lista fixa DEVOPS_PROJETOS — ver comentário em
  // app/api/capacidade/route.ts sobre por que essa lista fixa não serve aqui. União com o squad
  // das alocações já salvas, pra nunca esconder uma alocação existente mesmo que o Area Path dela
  // não apareça na leva atual de tarefas carregadas.
  const squads = useMemo(
    () =>
      Array.from(new Set([...tarefas.map((t) => t.areaPath), ...alocacoes.map((a) => a.squad)])).sort(),
    [tarefas, alocacoes]
  );

  const sprintsDevOps = useMemo(
    () =>
      Array.from(new Set(tarefas.map((t) => t.sprint))).sort((a, b) => {
        const pa = /(\d+)\.(\d+)/.exec(a);
        const pb = /(\d+)\.(\d+)/.exec(b);
        if (!pa || !pb) return a.localeCompare(b);
        return Number(pa[1]) !== Number(pb[1]) ? Number(pa[1]) - Number(pb[1]) : Number(pa[2]) - Number(pb[2]);
      }),
    [tarefas]
  );

  async function aoSelecionarSprintInicial(sprint: string) {
    setSprintInicial(sprint);
    if (!sprint) return;
    setAutoAlocando(true);
    try {
      const itens = agruparAlocacoesPorDevSprint(tarefas, sprint, squads);
      await fetch("/api/capacidade/auto-alocar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produto: PRODUTO, itens }),
      });
      carregarBoard();
    } finally {
      setAutoAlocando(false);
    }
  }

  const idsAlocados = useMemo(() => new Set(alocacoes.map((a) => a.devId)), [alocacoes]);
  const devsDisponiveis = useMemo(() => devs.filter((d) => !idsAlocados.has(d.id)), [devs, idsAlocados]);

  const sprintsParaExibir = useMemo(() => {
    const doAlocacoes = new Set(alocacoes.map((a) => a.sprint));
    if (sprintInicial) doAlocacoes.add(sprintInicial);
    return Array.from(doAlocacoes).sort((a, b) => {
      const pa = /(\d+)\.(\d+)/.exec(a);
      const pb = /(\d+)\.(\d+)/.exec(b);
      if (!pa || !pb) return a.localeCompare(b);
      return Number(pa[1]) !== Number(pb[1]) ? Number(pa[1]) - Number(pb[1]) : Number(pa[2]) - Number(pb[2]);
    });
  }, [alocacoes, sprintInicial]);

  async function mover(devId: string, sprintOrigem: string | null, sprintDestino: string | null, squadDestino: string | null) {
    // Otimista: já reflete a mudança na tela antes da resposta do servidor, pra arrastar parecer
    // instantâneo — sem isso, cada solto ficaria esperando o round-trip da API pra atualizar.
    setAlocacoes((atual) => {
      const semOrigem = sprintOrigem ? atual.filter((a) => !(a.devId === devId && a.sprint === sprintOrigem)) : atual;
      if (sprintDestino && squadDestino) {
        return [
          ...semOrigem.filter((a) => a.devId !== devId || a.sprint !== sprintDestino),
          { id: `tmp-${devId}-${sprintDestino}`, devId, sprint: sprintDestino, squad: squadDestino },
        ];
      }
      return semOrigem;
    });

    await fetch("/api/capacidade/mover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ devId, produto: PRODUTO, sprintOrigem, sprintDestino, squadDestino }),
    });
  }

  function onDropEm(sprintDestino: string | null, squadDestino: string | null) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const origem = dragRef.current;
      dragRef.current = null;
      if (!origem) return;
      mover(origem.devId, origem.sprintOrigem, sprintDestino, squadDestino);
    };
  }

  if (!aberto) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div onClick={onFechar} style={{ position: "absolute", inset: 0, background: "rgba(22,19,15,.45)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(880px, 96vw)",
          background: C.panel,
          boxShadow: "-8px 0 24px rgba(0,0,0,.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 20, color: C.text }}>
                Planejamento de capacidade
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
                Aloque pessoas entre squads e sprints. Cada pessoa representa 60 horas por sprint.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span className="kmm-chip">{idsAlocados.size} alocados</span>
              <span className="kmm-chip">{devsDisponiveis.length} disponíveis</span>
              <button onClick={onFechar} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>
              Sprint inicial {autoAlocando && "— alocando a partir do Azure DevOps…"}
            </div>
            <select
              className="kmm-input"
              style={{ width: "auto", minWidth: 220 }}
              value={sprintInicial}
              onChange={(e) => aoSelecionarSprintInicial(e.target.value)}
              disabled={autoAlocando || carregando}
            >
              <option value="">Selecione uma sprint…</option>
              {sprintsDevOps.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {carregando && <p style={{ color: C.muted }}>Carregando…</p>}
          {erro && (
            <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>
              {erro}
            </div>
          )}

          {!carregando && !erro && (
            <>
              <div
                className="kmm-card"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDropEm(null, null)}
                style={{ padding: 16 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Desenvolvedores disponíveis</div>
                    <div style={{ fontSize: 11.5, color: C.muted }}>Sem alocação em sprint ou squad</div>
                  </div>
                  <span className="kmm-chip">{devsDisponiveis.length} pessoas</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {devsDisponiveis.map((d) => (
                    <CartaoDev key={d.id} dev={d} sprintOrigem={null} dragRef={dragRef} />
                  ))}
                  {devsDisponiveis.length === 0 && (
                    <span style={{ fontSize: 12.5, color: C.muted }}>Nenhum dev disponível no momento.</span>
                  )}
                </div>
              </div>

              {sprintsParaExibir.map((sprint) => {
                const alocacoesDaSprint = alocacoes.filter((a) => a.sprint === sprint);
                const totalPessoas = alocacoesDaSprint.length;
                return (
                  <div key={sprint} className="kmm-card" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{sprint}</div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{totalPessoas * 60}h</div>
                        <div style={{ fontSize: 11, color: C.muted }}>capacidade total</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${squads.length}, minmax(180px, 1fr))`, gap: 12, overflowX: "auto" }}>
                      {squads.map((squad) => {
                        const devsDaSquad = alocacoesDaSprint
                          .filter((a) => a.squad === squad)
                          .map((a) => devs.find((d) => d.id === a.devId))
                          .filter((d): d is { id: string; nome: string; papel: string | null } => Boolean(d));
                        const nomeCurto = squad.split("\\").pop() || squad;
                        return (
                          <div
                            key={squad}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={onDropEm(sprint, squad)}
                            style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, minHeight: 90 }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 6 }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 12.5, color: C.text }}>{nomeCurto}</div>
                                <div style={{ fontSize: 11, color: C.muted }}>
                                  {devsDaSquad.length} pessoa{devsDaSquad.length === 1 ? "" : "s"}
                                </div>
                              </div>
                              <span className="kmm-chip" style={{ fontSize: 10.5, padding: "2px 8px" }}>
                                {devsDaSquad.length * 60}h
                              </span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {devsDaSquad.map((d) => (
                                <CartaoDev key={d.id} dev={d} sprintOrigem={sprint} dragRef={dragRef} />
                              ))}
                              {devsDaSquad.length === 0 && (
                                <div
                                  style={{
                                    border: `1px dashed ${C.border}`,
                                    borderRadius: 8,
                                    padding: "14px 8px",
                                    textAlign: "center",
                                    fontSize: 11.5,
                                    color: C.faint,
                                  }}
                                >
                                  Arraste ou selecione uma pessoa para alocar
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {sprintsParaExibir.length === 0 && (
                <p style={{ color: C.muted }}>Selecione uma Sprint inicial acima pra montar o planejamento.</p>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "10px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.muted }}>
          <span>Arraste uma pessoa e solte-a no destino desejado.</span>
          <span>60h por pessoa / sprint</span>
        </div>
      </div>
    </div>
  );
}

function CartaoDev({
  dev,
  sprintOrigem,
  dragRef,
}: {
  dev: { id: string; nome: string; papel: string | null };
  sprintOrigem: string | null;
  dragRef: React.MutableRefObject<{ devId: string; sprintOrigem: string | null } | null>;
}) {
  const iniciais = dev.nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const cor = corDoDev(dev.nome);

  return (
    <div
      draggable
      onDragStart={(e) => {
        dragRef.current = { devId: dev.id, sprintOrigem };
        e.dataTransfer.effectAllowed = "move";
      }}
      className="kmm-chip"
      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "grab", padding: "6px 10px" }}
      title={dev.nome}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: cor,
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {iniciais}
      </span>
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{dev.nome}</span>
        {dev.papel && <span style={{ fontSize: 10.5, color: C.muted }}>{dev.papel}</span>}
      </span>
      <GripVertical size={13} color={C.faint} style={{ marginLeft: 2 }} />
    </div>
  );
}

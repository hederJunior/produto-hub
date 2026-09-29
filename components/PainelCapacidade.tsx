"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { C, corDoDev, corDeEstadoDevOps } from "@/lib/kmm-theme";
import { agruparAlocacoesPorDevSprint, sprintEhIgualOuPosterior, type TarefaParaCapacidade } from "@/lib/capacidade";

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
  const [carregandoTarefas, setCarregandoTarefas] = useState(true);
  const [sprintInicial, setSprintInicial] = useState("");
  const [autoAlocando, setAutoAlocando] = useState(false);

  // Filtro por squad (toggle, pedido por Heder em 2026-09-29): vazio = nenhuma squad visível — o
  // board pode ter muitas squads (13 em KMM5) e a maioria não interessa pra todo planejamento.
  const [squadsSelecionadas, setSquadsSelecionadas] = useState<string[]>([]);

  // Detalhe de tasks de 1 dev numa sprint (pedido por Heder em 2026-09-29): clicar no card do dev
  // dentro de uma squad/sprint abre a lista de Task/Bug dele naquela sprint específica.
  const [detalheDev, setDetalheDev] = useState<{ nome: string; sprint: string } | null>(null);

  const dragRef = useRef<{ devId: string; sprintOrigem: string | null } | null>(null);
  // Guarda de corrida: carregarBoard() é chamado tanto ao abrir o painel quanto logo depois de
  // auto-alocar/mover — se a chamada mais antiga responder depois da mais recente, só aplica a
  // resposta se ela ainda for a mais recente (evita sobrescrever o board com um snapshot velho).
  const cargaSeqRef = useRef(0);

  function carregarBoard() {
    const minhaSeq = ++cargaSeqRef.current;
    setCarregando(true);
    setErro(null);
    fetch(`/api/capacidade?produto=${PRODUTO}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (minhaSeq !== cargaSeqRef.current) return;
        if (j.erro) setErro(j.erro);
        setDevs(j.devs ?? []);
        setAlocacoes(j.alocacoes ?? []);
      })
      .catch(() => {
        if (minhaSeq === cargaSeqRef.current) setErro("Não foi possível carregar o planejamento de capacidade.");
      })
      .finally(() => {
        if (minhaSeq === cargaSeqRef.current) setCarregando(false);
      });
  }

  useEffect(() => {
    if (!aberto) return;
    carregarBoard();
    setCarregandoTarefas(true);
    fetch(`/api/roadmap/tarefas?produto=${PRODUTO}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (j.erro) setErro(j.erro);
        setTarefas(j.tarefas ?? []);
      })
      .catch(() => setErro("Não foi possível carregar as tasks/bugs do Azure DevOps (KMM5)."))
      .finally(() => setCarregandoTarefas(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // Colunas de squad = Area Path real dos Task/Bug carregados (mesma fonte que a aba Sprints usa
  // pro filtro de área), em vez da lista fixa DEVOPS_PROJETOS — essa lista fixa é usada só nos
  // WIQL de Epics/PBI e excluiria squads reais de Task/Bug (ex. "Cabotagem - Maersk"). União com o
  // squad das alocações já salvas, pra nunca esconder uma alocação existente.
  const squads = useMemo(
    () =>
      Array.from(new Set([...tarefas.map((t) => t.areaPath), ...alocacoes.map((a) => a.squad)])).sort(),
    [tarefas, alocacoes]
  );

  const squadsExibidas = useMemo(
    () => squads.filter((s) => squadsSelecionadas.includes(s)),
    [squads, squadsSelecionadas]
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
    setErro(null);
    try {
      const itens = agruparAlocacoesPorDevSprint(tarefas, sprint, squads);
      const res = await fetch("/api/capacidade/auto-alocar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produto: PRODUTO, itens }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setErro(j?.erro ?? "Não foi possível alocar automaticamente a partir do Azure DevOps.");
      }
      carregarBoard();
    } catch {
      setErro("Não foi possível alocar automaticamente a partir do Azure DevOps.");
    } finally {
      setAutoAlocando(false);
    }
  }

  function alternarSquad(squad: string) {
    setSquadsSelecionadas((atual) => (atual.includes(squad) ? atual.filter((s) => s !== squad) : [...atual, squad]));
  }

  const idsAlocados = useMemo(() => new Set(alocacoes.map((a) => a.devId)), [alocacoes]);
  const devsDisponiveis = useMemo(() => devs.filter((d) => !idsAlocados.has(d.id)), [devs, idsAlocados]);

  // Horas já alocadas por dev+sprint (pedido por Heder em 2026-09-29): soma o SP Estimados
  // (Effort, mesmo campo usado como "SP Estimados" na aba Sprints — Task/Bug não tem Story Points
  // nativo, decisão já registrada nessa aba) de todas as Task/Bug do dev naquela sprint. Chave
  // "nome|sprint" pra achar em O(1) no card, sem refazer o filtro/soma a cada render.
  const horasAlocadasPorDevSprint = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const t of tarefas) {
      if (!t.responsavel?.nome) continue;
      const chave = `${t.responsavel.nome}|${t.sprint}`;
      mapa.set(chave, (mapa.get(chave) ?? 0) + (t.spEstimados ?? 0));
    }
    return mapa;
  }, [tarefas]);

  function horasAlocadas(nome: string, sprint: string): number {
    return Math.round(horasAlocadasPorDevSprint.get(`${nome}|${sprint}`) ?? 0);
  }

  const sprintsParaExibir = useMemo(() => {
    const doAlocacoes = new Set(alocacoes.map((a) => a.sprint));
    if (sprintInicial) doAlocacoes.add(sprintInicial);
    // Só sprints >= Sprint inicial (achado por Heder em 2026-09-29): antes juntava TODA sprint que
    // já tivesse alguma alocação, mesmo anterior à sprint inicial escolhida — ex.: Sprint 8.16
    // aparecendo no board mesmo com 8.17 selecionada, porque uma alocação antiga (de um "Sprint
    // inicial" escolhido antes, numa sessão anterior) ainda estava na tabela.
    const lista = sprintInicial
      ? Array.from(doAlocacoes).filter((s) => sprintEhIgualOuPosterior(s, sprintInicial))
      : Array.from(doAlocacoes);
    return lista.sort((a, b) => {
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

  const tarefasDoDetalhe = useMemo(() => {
    if (!detalheDev) return [];
    return tarefas.filter((t) => t.responsavel?.nome === detalheDev.nome && t.sprint === detalheDev.sprint);
  }, [tarefas, detalheDev]);

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
              <button className="kmm-btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={carregarBoard} title="Recarregar">
                Atualizar
              </button>
              <button onClick={onFechar} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>
              Sprint inicial{" "}
              {carregandoTarefas
                ? "— carregando tasks/bugs do Azure DevOps…"
                : autoAlocando
                  ? "— alocando a partir do Azure DevOps…"
                  : null}
            </div>
            <select
              className="kmm-input"
              style={{ width: "auto", minWidth: 220 }}
              value={sprintInicial}
              onChange={(e) => aoSelecionarSprintInicial(e.target.value)}
              disabled={autoAlocando || carregando || carregandoTarefas}
            >
              <option value="">Selecione uma sprint…</option>
              {sprintsDevOps.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {squads.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>
                Squads visíveis {squadsSelecionadas.length === 0 && "— nenhuma selecionada"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {squads.map((squad) => {
                  const ativa = squadsSelecionadas.includes(squad);
                  const nomeCurto = squad.split("\\").pop() || squad;
                  return (
                    <button
                      key={squad}
                      type="button"
                      onClick={() => alternarSquad(squad)}
                      className="kmm-chip"
                      style={{
                        cursor: "pointer",
                        background: ativa ? C.orange : "transparent",
                        color: ativa ? "#fff" : C.text,
                        borderColor: ativa ? C.orange : C.border,
                        fontWeight: ativa ? 700 : 600,
                      }}
                    >
                      {nomeCurto}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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

              {squadsExibidas.length === 0 && (
                <p style={{ color: C.muted }}>Selecione ao menos uma squad acima ("Squads visíveis") pra ver o planejamento por sprint.</p>
              )}

              {squadsExibidas.length > 0 &&
                sprintsParaExibir.map((sprint) => {
                  const alocacoesDaSprint = alocacoes.filter((a) => a.sprint === sprint && squadsExibidas.includes(a.squad));
                  const totalPessoas = alocacoesDaSprint.length;
                  return (
                    <div key={sprint} className="kmm-card" style={{ padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{sprint}</div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{totalPessoas * HORAS_POR_PESSOA_SPRINT}h</div>
                          <div style={{ fontSize: 11, color: C.muted }}>capacidade total</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${squadsExibidas.length}, minmax(180px, 1fr))`, gap: 12, overflowX: "auto" }}>
                        {squadsExibidas.map((squad) => {
                          const devsDaSquad = alocacoesDaSprint
                            .filter((a) => a.squad === squad)
                            .map((a) => devs.find((d) => d.id === a.devId))
                            .filter((d): d is { id: string; nome: string; papel: string | null } => Boolean(d));
                          const nomeCurto = squad.split("\\").pop() || squad;
                          // Saldo da squad (pedido por Heder em 2026-09-29): antes mostrava a
                          // capacidade bruta (pessoas × 60h); agora mostra só o saldo — capacidade
                          // menos o que já está alocado em Task/Bug de cada dev nessa sprint.
                          // Negativo = squad com mais trabalho alocado do que capacidade.
                          const totalAlocadoSquad = devsDaSquad.reduce((acc, d) => acc + horasAlocadas(d.nome, sprint), 0);
                          const saldoSquad = devsDaSquad.length * HORAS_POR_PESSOA_SPRINT - totalAlocadoSquad;
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
                                <span
                                  className="kmm-chip"
                                  style={{
                                    fontSize: 10.5,
                                    padding: "2px 8px",
                                    color: saldoSquad < 0 ? C.red : C.text,
                                    borderColor: saldoSquad < 0 ? C.red : C.border,
                                  }}
                                  title="Saldo: capacidade (pessoas × 60h) menos horas já alocadas"
                                >
                                  {saldoSquad}h
                                </span>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {devsDaSquad.map((d) => (
                                  <CartaoDev
                                    key={d.id}
                                    dev={d}
                                    sprintOrigem={sprint}
                                    dragRef={dragRef}
                                    horasAlocadas={horasAlocadas(d.nome, sprint)}
                                    onAbrirDetalhe={() => setDetalheDev({ nome: d.nome, sprint })}
                                  />
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

              {squadsExibidas.length > 0 && sprintsParaExibir.length === 0 && (
                <p style={{ color: C.muted }}>Selecione uma Sprint inicial acima pra montar o planejamento.</p>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "10px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.muted }}>
          <span>Arraste uma pessoa e solte-a no destino desejado. Clique num nome pra ver as tasks dela na sprint.</span>
          <span>60h por pessoa / sprint</span>
        </div>
      </div>

      {detalheDev && (
        <ModalTasksDev
          nome={detalheDev.nome}
          sprint={detalheDev.sprint}
          tarefas={tarefasDoDetalhe}
          onFechar={() => setDetalheDev(null)}
        />
      )}
    </div>
  );
}

/** Capacidade fixa por pessoa/sprint (regra do produto: "cada pessoa representa 60 horas por
 * sprint") — mesmo valor usado no card da squad e no cabeçalho de cada sprint. */
const HORAS_POR_PESSOA_SPRINT = 60;

function CartaoDev({
  dev,
  sprintOrigem,
  dragRef,
  horasAlocadas,
  onAbrirDetalhe,
}: {
  dev: { id: string; nome: string; papel: string | null };
  sprintOrigem: string | null;
  dragRef: React.MutableRefObject<{ devId: string; sprintOrigem: string | null } | null>;
  /** Soma de SP Estimados das Task/Bug do dev nessa sprint — omitido pros cards do pool
   * "Desenvolvedores disponíveis" (não tem uma sprint específica pra calcular). */
  horasAlocadas?: number;
  onAbrirDetalhe?: () => void;
}) {
  const iniciais = dev.nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const cor = corDoDev(dev.nome);
  const sobrecarregado = horasAlocadas != null && horasAlocadas > HORAS_POR_PESSOA_SPRINT;

  return (
    <div
      draggable
      onDragStart={(e) => {
        dragRef.current = { devId: dev.id, sprintOrigem };
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onAbrirDetalhe}
      className="kmm-chip"
      style={{ display: "flex", alignItems: "center", gap: 8, cursor: onAbrirDetalhe ? "pointer" : "grab", padding: "6px 10px" }}
      title={
        (onAbrirDetalhe ? `${dev.nome} — clique para ver as tasks nesta sprint` : dev.nome) +
        (horasAlocadas != null ? ` · ${HORAS_POR_PESSOA_SPRINT}h disponíveis / ${horasAlocadas}h alocadas` : "")
      }
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
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {dev.nome}
        </span>
        {dev.papel && <span style={{ fontSize: 10.5, color: C.muted }}>{dev.papel}</span>}
      </span>
      {horasAlocadas != null && (
        <span style={{ fontSize: 11, fontWeight: 700, color: sobrecarregado ? C.red : C.text, flexShrink: 0, whiteSpace: "nowrap" }}>
          {HORAS_POR_PESSOA_SPRINT} / {horasAlocadas}
        </span>
      )}
      <GripVertical size={13} color={C.faint} style={{ marginLeft: 2, flexShrink: 0 }} />
    </div>
  );
}

/** Modal com as Task/Bug de 1 dev numa sprint específica (pedido por Heder em 2026-09-29): abre
 * ao clicar no nome do dev dentro de uma squad/sprint no board de capacidade. */
function ModalTasksDev({
  nome,
  sprint,
  tarefas,
  onFechar,
}: {
  nome: string;
  sprint: string;
  tarefas: TarefaParaCapacidade[];
  onFechar: () => void;
}) {
  return (
    <div
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22,19,15,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 300,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="kmm-card"
        style={{ maxWidth: 560, width: "100%", maxHeight: "80vh", overflowY: "auto", padding: 20 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 16, color: C.text }}>{nome}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {sprint} · {tarefas.length} item{tarefas.length === 1 ? "" : "s"}
            </div>
          </div>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {tarefas.length === 0 && <p style={{ color: C.muted, fontSize: 13 }}>Nenhuma Task ou Bug encontrada.</p>}
          {tarefas.map((t) => {
            const status = corDeEstadoDevOps(t.state);
            const tipoBug = t.tipo.toLowerCase() === "bug";
            return (
              <div key={t.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{t.titulo}</span>
                  <span
                    className="kmm-chip"
                    style={{ fontSize: 10.5, flexShrink: 0, background: tipoBug ? "#FBE7E4" : "#E7F0FA", color: tipoBug ? C.red : C.blue, borderColor: "transparent" }}
                  >
                    {t.tipo}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span className="kmm-chip" style={{ fontSize: 10.5, background: status.bg, color: status.fg, borderColor: "transparent" }}>
                    {t.state}
                  </span>
                  <span style={{ fontSize: 11, color: C.muted }}>{t.areaPath.split("\\").pop() || t.areaPath}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

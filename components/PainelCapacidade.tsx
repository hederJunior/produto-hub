"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, GripVertical, Plus, RefreshCw, X } from "lucide-react";
import { C, corDoDev, corDeEstadoDevOps } from "@/lib/kmm-theme";
import {
  ETAPA_EXECUCAO,
  HORAS_MAX_SPRINT,
  motivoBloqueioTask,
  type PbiPriorizacao,
  type ResultadoEtapaPbi,
  type TaskDoPbi,
} from "@/lib/alocacao-pbi";
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

  // Cadastro manual de disponibilidade (pedido por Heder em 2026-09-30): antes o único jeito de um
  // dev aparecer no board era ter Task/Bug alocada no Azure DevOps; essa tela permite vincular
  // qualquer dev do roster (cadastrado em Administração > Cadastro de devs) numa squad/sprint sem
  // depender disso, e listar/excluir os vínculos existentes.
  const [dispAberto, setDispAberto] = useState(false);

  // "Alocar PBI" (pedido por Heder em 2026-10-14): o botão + em cada bloco sprint × squad abre o
  // modal que move uma Task/Bug de um PBI "Aguardando Priorização" pra essa sprint e a atribui a um
  // dev — grava no Azure DevOps, por isso só aparece pra admin (a API também recusa não-admin).
  const [ehAdminUsuario, setEhAdminUsuario] = useState(false);
  const [alocarEm, setAlocarEm] = useState<{ sprint: string; squad: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setEhAdminUsuario(j?.tipo === "adm"))
      .catch(() => setEhAdminUsuario(false));
  }, []);

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

  /**
   * Depois de uma alocação no Azure DevOps (modal "Alocar PBI"): espera o Azure REFLETIR a mudança e
   * força o refresh do painel. O PATCH é imediato, mas a lista que o quadro usa (WIQL) pode demorar
   * alguns segundos pra enxergar o item na sprint nova — então consulta a mesma fonte do quadro, de
   * 2 em 2s (até MAX vezes), até a Task aparecer na sprint com o dev certo. Antes disso garante o
   * card do dev no bloco (vínculo AlocacaoCapacidade), senão ele não apareceria na squad/sprint —
   * só cria se o dev ainda não tiver vínculo naquela sprint (nunca move quem já está em outra squad).
   * Devolve true se o Azure confirmou; false se esgotou as tentativas (dados ainda são aplicados).
   */
  async function sincronizarAposAlocar(
    p: { taskId: number; sprint: string; squad: string; dev: { id: string; nome: string } },
    aoTentar: (n: number, max: number) => void
  ): Promise<boolean> {
    if (!alocacoes.some((a) => a.devId === p.dev.id && a.sprint === p.sprint)) {
      await mover(p.dev.id, null, p.sprint, p.squad);
    }
    const MAX = 8;
    let confirmado = false;
    for (let i = 1; i <= MAX; i++) {
      aoTentar(i, MAX);
      try {
        const res = await fetch(`/api/roadmap/tarefas?produto=${PRODUTO}`, { cache: "no-store" });
        const j = await res.json();
        if (!j.erro) {
          const lista = (j.tarefas ?? []) as TarefaParaCapacidade[];
          setTarefas(lista);
          if (lista.some((t) => t.id === p.taskId && t.sprint === p.sprint && t.responsavel?.nome === p.dev.nome)) {
            confirmado = true;
            break;
          }
        }
      } catch {
        // tenta de novo na próxima volta
      }
      if (i < MAX) await new Promise((r) => setTimeout(r, 2000));
    }
    carregarBoard();
    return confirmado;
  }

  function carregarTarefas() {
    setCarregandoTarefas(true);
    fetch(`/api/roadmap/tarefas?produto=${PRODUTO}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        // "detalhe" é diagnóstico temporário (Heder, 2026-09-30) — ver comentário em
        // app/api/roadmap/tarefas/route.ts.
        if (j.erro) setErro(j.detalhe ? `${j.erro} (${j.detalhe})` : j.erro);
        setTarefas(j.tarefas ?? []);
      })
      .catch(() => setErro("Não foi possível carregar as tasks/bugs do Azure DevOps (KMM5)."))
      .finally(() => setCarregandoTarefas(false));
  }

  useEffect(() => {
    if (!aberto) return;
    carregarBoard();
    carregarTarefas();
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
              <button className="kmm-btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setDispAberto(true)}>
                Cadastrar disponibilidade
              </button>
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
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  {ehAdminUsuario && (
                                    <button
                                      onClick={() => setAlocarEm({ sprint, squad })}
                                      title="Alocar uma Task de PBI aguardando priorização nesta sprint"
                                      aria-label="Alocar PBI"
                                      className="kmm-btn"
                                      style={{ padding: 3, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7 }}
                                    >
                                      <Plus size={14} />
                                    </button>
                                  )}
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

      {dispAberto && (
        <ModalDisponibilidade
          devs={devs}
          squads={squads}
          sprints={sprintsDevOps}
          alocacoes={alocacoes}
          onVincular={(devId, sprint, squad) => mover(devId, null, sprint, squad)}
          onRemover={(devId, sprint) => mover(devId, sprint, null, null)}
          onFechar={() => setDispAberto(false)}
        />
      )}

      {alocarEm && (
        <ModalAlocarPbi
          sprint={alocarEm.sprint}
          squad={alocarEm.squad}
          devs={devs}
          horasAlocadas={horasAlocadas}
          onSincronizar={sincronizarAposAlocar}
          onFechar={() => setAlocarEm(null)}
          onConcluido={() => setAlocarEm(null)}
        />
      )}
    </div>
  );
}

/** Capacidade fixa por pessoa/sprint (regra do produto: "cada pessoa representa 60 horas por
 * sprint") — mesmo valor usado no card da squad e no cabeçalho de cada sprint. */
const HORAS_POR_PESSOA_SPRINT = 60;

/**
 * Modal "Alocar PBI" (pedido por Heder em 2026-10-14), aberto pelo + de um bloco sprint × squad.
 * Fluxo: PBIs da squad em "Aguardando Priorização" → Tasks/Bugs do PBI → devs com menos de 60h na
 * sprint → confirmação → grava no Azure DevOps (Iteration = sprint do bloco, Area Path = squad do
 * bloco, responsável = dev).
 * Task/Bug sem esforço, com mais de 60h, fora do Backlog ou já em sprint aparece desabilitada com o
 * motivo (regra em lib/alocacao-pbi.ts, revalidada no servidor). Dev que passaria de 60h com a task
 * é só avisado, não bloqueado.
 */
function ModalAlocarPbi({
  sprint,
  squad,
  devs,
  horasAlocadas,
  onSincronizar,
  onFechar,
  onConcluido,
}: {
  sprint: string;
  squad: string;
  devs: { id: string; nome: string; papel: string | null }[];
  horasAlocadas: (nome: string, sprint: string) => number;
  onSincronizar: (
    p: { taskId: number; sprint: string; squad: string; dev: { id: string; nome: string } },
    aoTentar: (n: number, max: number) => void
  ) => Promise<boolean>;
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const [pbis, setPbis] = useState<PbiPriorizacao[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [pbiSel, setPbiSel] = useState<PbiPriorizacao | null>(null);
  const [taskSel, setTaskSel] = useState<TaskDoPbi | null>(null);
  const [devSel, setDevSel] = useState<{ id: string; nome: string; papel: string | null; horas: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  // Espera pela confirmação do Azure DevOps depois da gravação (tentativa atual / máximo).
  const [sincronizando, setSincronizando] = useState<{ n: number; max: number } | null>(null);
  // Resultado final: mostrado quando a Etapa do PBI mudou/falhou ou quando o Azure ainda não refletiu.
  const [final, setFinal] = useState<{ etapa: ResultadoEtapaPbi | null; confirmado: boolean } | null>(null);

  const nomeSquad = squad.split("\\").pop() || squad;

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/capacidade/pbis-priorizacao?squad=${encodeURIComponent(squad)}`, { cache: "no-store" })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (cancelado) return;
        if (!res.ok) setErroCarga(j.detalhe ? `${j.erro} (${j.detalhe})` : j.erro ?? "Não foi possível carregar os PBIs.");
        else setPbis(j.pbis ?? []);
      })
      .catch(() => {
        if (!cancelado) setErroCarga("Não foi possível carregar os PBIs.");
      });
    return () => {
      cancelado = true;
    };
  }, [squad]);

  const devsDisponiveis = useMemo(
    () =>
      devs
        .map((d) => ({ ...d, horas: horasAlocadas(d.nome, sprint) }))
        .filter((d) => d.horas < HORAS_MAX_SPRINT)
        .sort((a, b) => a.horas - b.horas || a.nome.localeCompare(b.nome, "pt-BR")),
    [devs, horasAlocadas, sprint]
  );

  const passo = final ? "concluido" : sincronizando ? "sincronizando" : devSel ? "confirmar" : taskSel ? "devs" : pbiSel ? "tasks" : "pbis";

  // Enquanto grava e espera o Azure confirmar, o modal não pode ser fechado/voltado.
  const ocupado = enviando || !!sincronizando;
  function fecharSeLivre() {
    if (!ocupado) onFechar();
  }

  function voltar() {
    setErroEnvio(null);
    if (devSel) setDevSel(null);
    else if (taskSel) setTaskSel(null);
    else setPbiSel(null);
  }

  async function confirmar() {
    if (!taskSel || !devSel) return;
    setEnviando(true);
    setErroEnvio(null);
    try {
      const res = await fetch("/api/capacidade/alocar-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: taskSel.id, sprint, devNome: devSel.nome, areaPath: squad }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroEnvio(j.detalhe ? `${j.erro} (${j.detalhe})` : j.erro ?? "Não foi possível atualizar o Azure DevOps.");
        return;
      }
      // Gravado. Agora espera o Azure refletir a mudança e força o refresh do painel.
      setEnviando(false);
      setSincronizando({ n: 0, max: 1 });
      const confirmado = await onSincronizar(
        { taskId: taskSel.id, sprint, squad, dev: { id: devSel.id, nome: devSel.nome } },
        (n, max) => setSincronizando({ n, max })
      );
      setSincronizando(null);
      const etapa = (j.etapaPbi as ResultadoEtapaPbi | null | undefined) ?? null;
      if (confirmado && !(etapa && (etapa.atualizada || etapa.aviso))) onConcluido();
      else setFinal({ etapa, confirmado });
    } catch {
      setErroEnvio("Não foi possível atualizar o Azure DevOps.");
    } finally {
      setEnviando(false);
    }
  }

  const titulos: Record<typeof passo, string> = {
    pbis: "PBIs aguardando priorização",
    tasks: `PBI #${pbiSel?.id ?? ""} — escolha a Task`,
    devs: `Task #${taskSel?.id ?? ""} — escolha o dev`,
    confirmar: "Confirmar alocação",
    sincronizando: "Aguardando o Azure DevOps",
    concluido: "Alocação concluída",
  };

  const chip = (texto: string, extra?: React.CSSProperties) => (
    <span className="kmm-chip" style={{ fontSize: 10.5, padding: "2px 8px", ...extra }}>
      {texto}
    </span>
  );

  return (
    <div
      onClick={fecharSeLivre}
      style={{ position: "fixed", inset: 0, background: "rgba(22,19,15,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="kmm-card"
        style={{ maxWidth: 720, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: 20 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            {passo !== "pbis" && passo !== "concluido" && passo !== "sincronizando" && (
              <button onClick={voltar} aria-label="Voltar" disabled={enviando} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4, marginTop: 1 }}>
                <ArrowLeft size={18} />
              </button>
            )}
            <div>
              <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 16, color: C.text }}>{titulos[passo]}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Alocar em {sprint} · {nomeSquad}
              </div>
            </div>
          </div>
          <button onClick={final ? onConcluido : fecharSeLivre} aria-label="Fechar" disabled={ocupado} style={{ background: "none", border: "none", cursor: ocupado ? "not-allowed" : "pointer", color: C.muted, padding: 4, opacity: ocupado ? 0.4 : 1 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          {passo === "sincronizando" && sincronizando && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 4px" }}>
              <RefreshCw size={20} color={C.orange} className="kmm-spin" />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Alteração gravada. Aguardando o Azure DevOps confirmar…</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {sincronizando.n > 0 ? `Conferindo (tentativa ${sincronizando.n} de ${sincronizando.max})` : "Preparando"} — o painel será atualizado em seguida.
                </div>
              </div>
            </div>
          )}

          {passo === "pbis" && (
            <>
              {erroCarga && <div style={{ color: C.red, fontSize: 13 }}>{erroCarga}</div>}
              {!erroCarga && pbis === null && <p style={{ color: C.muted, fontSize: 13 }}>Carregando PBIs do Azure DevOps…</p>}
              {pbis && pbis.length === 0 && (
                <p style={{ color: C.muted, fontSize: 13 }}>Nenhum PBI aguardando priorização para {nomeSquad}.</p>
              )}
              {pbis && pbis.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
                  {pbis.map((p) => {
                    const alocaveis = p.tasks.filter((t) => !motivoBloqueioTask(t)).length;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPbiSel(p)}
                        className="kmm-card"
                        style={{ textAlign: "left", cursor: "pointer", padding: 12, display: "flex", flexDirection: "column", gap: 6, fontFamily: "inherit" }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>#{p.id}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {p.titulo}
                        </span>
                        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: "auto" }}>
                          {chip(p.esforco != null ? `Effort: ${p.esforco}h` : "Sem effort", { fontWeight: 700, color: C.text })}
                          {chip(p.cliente ? `Cliente: ${p.cliente}` : "Sem cliente")}
                          {chip(p.state)}
                          {chip(`${p.tasks.length} task${p.tasks.length === 1 ? "" : "s"} · ${alocaveis} alocáve${alocaveis === 1 ? "l" : "is"}`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {passo === "tasks" && pbiSel && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                #{pbiSel.id} · {pbiSel.titulo}
              </div>
              {pbiSel.tasks.length === 0 && <p style={{ color: C.muted, fontSize: 13 }}>Este PBI não tem Tasks ou Bugs.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pbiSel.tasks.map((t) => {
                  const bloqueio = motivoBloqueioTask(t);
                  return (
                    <div
                      key={t.id}
                      style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, opacity: bloqueio ? 0.7 : 1 }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                          {t.tipo} #{t.id} · {t.titulo}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {chip(t.state)}
                          {chip(t.esforco != null ? `${t.esforco}h` : "sem esforço")}
                          {t.sprint && chip(t.sprint)}
                          {t.responsavel && chip(t.responsavel)}
                        </div>
                        {bloqueio && <div style={{ fontSize: 11.5, color: C.red, marginTop: 6 }}>{bloqueio}</div>}
                      </div>
                      <button className="kmm-btn" style={{ padding: "6px 12px", fontSize: 12 }} disabled={!!bloqueio} onClick={() => setTaskSel(t)} title={bloqueio ?? "Escolher o dev"}>
                        Alocar
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {passo === "devs" && taskSel && (
            <>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
                Devs com menos de {HORAS_MAX_SPRINT}h alocadas na {sprint}. Esta task tem {taskSel.esforco}h.
              </div>
              {devsDisponiveis.length === 0 && <p style={{ color: C.muted, fontSize: 13 }}>Nenhum dev com menos de {HORAS_MAX_SPRINT}h nesta sprint.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {devsDisponiveis.map((d) => {
                  const depois = d.horas + (taskSel.esforco ?? 0);
                  const estoura = depois > HORAS_MAX_SPRINT;
                  return (
                    <div key={d.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{d.nome}</div>
                        <div style={{ fontSize: 11.5, color: C.muted }}>{d.papel ?? "Sem função"}</div>
                      </div>
                      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>
                          {d.horas} / {HORAS_MAX_SPRINT}h
                        </div>
                        <div style={{ fontSize: 11, color: estoura ? C.amber : C.muted }}>
                          ficaria com {depois}h{estoura ? " (acima de 60h)" : ""}
                        </div>
                      </div>
                      <button className="kmm-btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setDevSel({ id: d.id, nome: d.nome, papel: d.papel, horas: d.horas })}>
                        Escolher
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {passo === "concluido" && final && (
            <>
              <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>
                A Task #{taskSel?.id} foi alocada em <strong>{sprint}</strong> para <strong>{devSel?.nome}</strong>.
              </div>
              {!final.confirmado && (
                <div style={{ fontSize: 13, color: C.amber, marginTop: 10 }}>
                  O Azure DevOps ainda não refletiu a mudança na lista do painel. A alteração foi gravada; use &quot;Atualizar&quot; em alguns instantes.
                </div>
              )}
              {final.etapa?.atualizada && (
                <div style={{ fontSize: 13.5, color: C.green, marginTop: 10 }}>
                  Todas as Tasks do PBI #{final.etapa.pbiId} estão alocadas: a Etapa do PBI passou para <strong>{ETAPA_EXECUCAO}</strong>.
                </div>
              )}
              {final.etapa?.aviso && <div style={{ fontSize: 13, color: C.amber, marginTop: 10 }}>{final.etapa.aviso}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button className="kmm-btn primary" onClick={onConcluido}>
                  Fechar
                </button>
              </div>
            </>
          )}

          {passo === "confirmar" && taskSel && devSel && (
            <>
              <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>
                Isto altera o <strong>Azure DevOps</strong>, visível para todo o time. Na {taskSel.tipo} <strong>#{taskSel.id}</strong> ({taskSel.titulo}):
              </div>
              <ul style={{ fontSize: 13.5, color: C.text, margin: "10px 0", paddingLeft: 20, lineHeight: 1.7 }}>
                <li>
                  Iteration: <strong>{sprint}</strong>
                </li>
                <li>
                  Area Path: <strong>{squad}</strong>
                </li>
                <li>
                  Responsável: <strong>{devSel.nome}</strong>
                </li>
              </ul>
              {devSel.horas + (taskSel.esforco ?? 0) > HORAS_MAX_SPRINT && (
                <div style={{ fontSize: 12.5, color: C.amber, marginBottom: 10 }}>
                  Atenção: {devSel.nome} ficará com {devSel.horas + (taskSel.esforco ?? 0)}h na sprint, acima de {HORAS_MAX_SPRINT}h.
                </div>
              )}
              {erroEnvio && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 10 }}>{erroEnvio}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="kmm-btn" onClick={voltar} disabled={enviando}>
                  Cancelar
                </button>
                <button className="kmm-btn primary" onClick={confirmar} disabled={enviando}>
                  {enviando ? "Gravando…" : "Confirmar"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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
  // Nome e cliente do PBI pai de cada Task/Bug (pedido por Heder em 2026-10-14): buscados ao abrir
  // o detalhe, só dos PBIs das tasks mostradas. Falha silenciosa — sem isso a lista continua útil.
  const [pais, setPais] = useState<Record<number, { titulo: string; cliente: string }>>({});
  const idsPais = useMemo(
    () => Array.from(new Set(tarefas.map((t) => t.pbiPaiId).filter((n): n is number => n != null))),
    [tarefas]
  );
  useEffect(() => {
    if (!idsPais.length) return;
    let cancelado = false;
    fetch("/api/roadmap/pais", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: idsPais }),
    })
      .then((res) => res.json())
      .then((j) => {
        if (!cancelado) setPais(j.pais ?? {});
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [idsPais]);

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
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <span className="kmm-chip" style={{ fontSize: 10.5, background: status.bg, color: status.fg, borderColor: "transparent" }}>
                    {t.state}
                  </span>
                  <span className="kmm-chip" style={{ fontSize: 10.5, fontWeight: 700, color: C.text }} title="Effort (esforço estimado) da tarefa">
                    {t.spEstimados != null ? `Effort: ${t.spEstimados}h` : "Sem effort"}
                  </span>
                  <span style={{ fontSize: 11, color: C.muted }}>{t.areaPath.split("\\").pop() || t.areaPath}</span>
                </div>
                {t.pbiPaiId != null && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}`, fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                    <div>
                      <strong style={{ color: C.text }}>PBI pai:</strong>{" "}
                      {pais[t.pbiPaiId] ? `#${t.pbiPaiId} · ${pais[t.pbiPaiId].titulo}` : `#${t.pbiPaiId}`}
                    </div>
                    {pais[t.pbiPaiId]?.cliente && (
                      <div>
                        <strong style={{ color: C.text }}>Cliente:</strong> {pais[t.pbiPaiId].cliente}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * "Cadastrar disponibilidade" (pedido por Heder em 2026-09-30): vincular manualmente um dev do
 * roster (cadastrado em Administração > Cadastro de devs) numa squad/sprint, sem depender de ele
 * já ter Task/Bug atribuída no Azure DevOps — único jeito que existia até então de um card de dev
 * aparecer no board. Insere via a mesma função `mover` do drag-and-drop (upsert em
 * AlocacaoCapacidade), então o card criado aqui se comporta igual a qualquer outro no board: pode
 * ser arrastado, clicado pra ver tasks, etc. Lista embaixo mostra TODAS as alocações atuais
 * (manuais ou vindas de auto-alocação — não há distinção no dado, as duas origens convivem na
 * mesma tabela) com opção de excluir.
 */
function ModalDisponibilidade({
  devs,
  squads,
  sprints,
  alocacoes,
  onVincular,
  onRemover,
  onFechar,
}: {
  devs: { id: string; nome: string; papel: string | null }[];
  squads: string[];
  sprints: string[];
  alocacoes: { id: string; devId: string; sprint: string; squad: string }[];
  onVincular: (devId: string, sprint: string, squad: string) => void;
  onRemover: (devId: string, sprint: string) => void;
  onFechar: () => void;
}) {
  const [devId, setDevId] = useState("");
  const [sprint, setSprint] = useState("");
  const [squad, setSquad] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);

  function vincular() {
    if (!devId || !sprint || !squad) {
      setMensagem("Selecione dev, sprint e squad.");
      return;
    }
    onVincular(devId, sprint, squad);
    setMensagem(null);
    setDevId("");
    setSprint("");
    setSquad("");
  }

  const linhas = [...alocacoes]
    .map((a) => ({ ...a, dev: devs.find((d) => d.id === a.devId) }))
    .filter((a): a is typeof a & { dev: { id: string; nome: string; papel: string | null } } => Boolean(a.dev))
    .sort((a, b) => a.sprint.localeCompare(b.sprint) || a.dev.nome.localeCompare(b.dev.nome));

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
        style={{ maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: 20 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 16, color: C.text }}>
              Cadastrar disponibilidade
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              Vincula um dev do roster numa squad/sprint — ele passa a aparecer como card no board, mesmo sem
              nenhuma Task/Bug atribuída no Azure DevOps.
            </div>
          </div>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Dev</div>
            <select className="kmm-input" style={{ width: 200 }} value={devId} onChange={(e) => setDevId(e.target.value)}>
              <option value="">Selecione…</option>
              {devs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Sprint</div>
            <select className="kmm-input" style={{ width: 140 }} value={sprint} onChange={(e) => setSprint(e.target.value)}>
              <option value="">Selecione…</option>
              {sprints.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Squad</div>
            <select className="kmm-input" style={{ width: 200 }} value={squad} onChange={(e) => setSquad(e.target.value)}>
              <option value="">Selecione…</option>
              {squads.map((s) => (
                <option key={s} value={s}>
                  {s.split("\\").pop() || s}
                </option>
              ))}
            </select>
          </div>
          <button className="kmm-btn" onClick={vincular}>
            Vincular
          </button>
        </div>
        {mensagem && <p style={{ color: C.red, fontSize: 12.5, marginTop: 8 }}>{mensagem}</p>}
        {devs.length === 0 && (
          <p style={{ color: C.muted, fontSize: 12.5, marginTop: 8 }}>
            Nenhum dev cadastrado ainda — cadastre em Administração &gt; Cadastro de devs.
          </p>
        )}

        <div style={{ marginTop: 20, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8 }}>
            Disponibilidades cadastradas ({linhas.length})
          </div>
          {linhas.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 12.5 }}>Nenhuma disponibilidade cadastrada ainda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {linhas.map((l) => (
                <div
                  key={l.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 10px",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ fontWeight: 600, color: C.text }}>{l.dev.nome}</span>
                  <span className="kmm-chip" style={{ fontSize: 11 }}>{l.sprint}</span>
                  <span style={{ flex: 1, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.squad.split("\\").pop() || l.squad}
                  </span>
                  <button
                    className="kmm-btn"
                    style={{ padding: 6, flexShrink: 0 }}
                    onClick={() => onRemover(l.devId, l.sprint)}
                    title="Excluir disponibilidade"
                  >
                    <X size={13} color={C.red} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

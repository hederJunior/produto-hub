"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown } from "lucide-react";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import { C, PASTEL, corDeEstadoDevOps } from "@/lib/kmm-theme";
import { chaveDia, formatarChaveDia } from "@/lib/datas";
import { nomeCurtoDaSquad } from "@/lib/backlog";
import { listaCabecalho, listaCelula, listaLinha, listaTituloGrupo } from "@/lib/kmm-lista";
import { compararSprints, numeroDaSprint, sprintAtual, sprintEncerrada, type ItemPrevisao, type SprintPrevisao } from "@/lib/previsao-entregas";

const ORG_DEVOPS = "kmmbynstech";

// id | Título | Cliente | PO | Squad | Status | Etapa | Classificação
const COLUNAS = "64px minmax(240px, 2.4fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) 130px 130px minmax(110px, 1fr)";

/** Largura mínima de cada barra do gráfico (com muitas sprints o gráfico ganha rolagem horizontal). */
const LARGURA_BARRA = 62;

/**
 * Downstream > "Previsão de Entregas": gráfico de volume por sprint + lista de PBIs em aberto agrupada
 * pela sprint (Iteration do PBI), no modelo da lista de "Backlog Carteira". Por padrão mostra a sprint
 * em andamento e as futuras; as já encerradas (com PBIs que não foram concluídos) entram pelo botão
 * "Mostrar sprints encerradas". Filtros de Sprint e de Area Path (multi-seleção, vazio = todos) valem
 * para o gráfico e para a lista; escolher uma sprint encerrada a exibe mesmo com o botão desligado.
 */
export default function PrevisaoEntregas({ itens, sprints, hoje, mostrarProjeto }: { itens: ItemPrevisao[]; sprints: SprintPrevisao[]; hoje: Date; mostrarProjeto: boolean }) {
  const [recolhidos, setRecolhidos] = useState<Record<string, boolean>>({});
  const [comEncerradas, setComEncerradas] = useState(false);
  // Filtros: vazio = todas as sprints / todas as áreas. Sprint = Iteration Path completo; Área = Area Path completo.
  const [sprintsSel, setSprintsSel] = useState<string[]>([]);
  const [areasSel, setAreasSel] = useState<string[]>([]);
  const hojeChave = chaveDia(hoje);

  const todasAsSprints = useMemo(() => [...sprints].sort(compararSprints), [sprints]);
  const qtdEncerradas = todasAsSprints.filter((s) => sprintEncerrada(s, hojeChave)).length;

  const opcoesSprint = useMemo(() => todasAsSprints.map((s) => s.chave), [todasAsSprints]);
  const rotuloSprintPorChave = useMemo(
    () => new Map(todasAsSprints.map((s) => [s.chave, mostrarProjeto ? `${s.nome} (${s.projeto})` : s.nome])),
    [todasAsSprints, mostrarProjeto]
  );

  // Áreas oferecidas = as dos PBIs carregados. Nome curto; se o mesmo nome existe em KMM4 e KMM5 (ex.: "Melhorias"), o projeto entra entre parênteses.
  const opcoesArea = useMemo(
    () => Array.from(new Set(itens.map((i) => i.areaPath).filter(Boolean))).sort((a, b) => nomeCurtoDaSquad(a).localeCompare(nomeCurtoDaSquad(b), "pt-BR") || a.localeCompare(b)),
    [itens]
  );
  const rotuloArea = useMemo(() => {
    const vistos = new Set<string>();
    const repetidos = new Set<string>();
    for (const a of opcoesArea) {
      const curto = nomeCurtoDaSquad(a);
      if (vistos.has(curto)) repetidos.add(curto);
      vistos.add(curto);
    }
    return (areaPath: string) => {
      const curto = nomeCurtoDaSquad(areaPath);
      return repetidos.has(curto) ? `${curto} (${areaPath.split("\\")[0]})` : curto;
    };
  }, [opcoesArea]);

  // Troca de produto/recarga: seleção que não existe mais é descartada.
  useEffect(() => {
    setSprintsSel((sel) => (sel.every((k) => opcoesSprint.includes(k)) ? sel : sel.filter((k) => opcoesSprint.includes(k))));
  }, [opcoesSprint]);
  useEffect(() => {
    setAreasSel((sel) => (sel.every((a) => opcoesArea.includes(a)) ? sel : sel.filter((a) => opcoesArea.includes(a))));
  }, [opcoesArea]);

  const filtrando = sprintsSel.length > 0 || areasSel.length > 0;

  const grupos = useMemo(() => {
    const porSprint = new Map<string, ItemPrevisao[]>();
    for (const i of itens) {
      if (areasSel.length && !areasSel.includes(i.areaPath)) continue;
      porSprint.set(i.iterationPath, [...(porSprint.get(i.iterationPath) ?? []), i]);
    }
    return todasAsSprints
      // Sprint escolhida no filtro aparece mesmo se encerrada; sem escolha, vale o botão "sprints encerradas".
      .filter((s) => (sprintsSel.length ? sprintsSel.includes(s.chave) : comEncerradas || !sprintEncerrada(s, hojeChave)))
      // Com filtro de área, sprint sem PBI dessa área não vira grupo vazio.
      .filter((s) => !areasSel.length || (porSprint.get(s.chave)?.length ?? 0) > 0)
      .map((s) => {
        const atual = sprintAtual(s, hojeChave);
        const encerrada = sprintEncerrada(s, hojeChave);
        const cor = atual ? C.orange : s.projeto === "KMM4" ? PASTEL.purple.dot : C.blue;
        const doGrupo = (porSprint.get(s.chave) ?? []).sort((a, b) => a.id - b.id);
        return { sprint: s, atual, encerrada, cor, itens: doGrupo };
      });
  }, [itens, todasAsSprints, comEncerradas, hojeChave, sprintsSel, areasSel]);

  const totalVisivel = grupos.reduce((n, g) => n + g.itens.length, 0);
  const rotulo = (s: SprintPrevisao) => (mostrarProjeto ? `${s.projeto} · ${numeroDaSprint(s.nome)}` : numeroDaSprint(s.nome));
  const dadosGrafico = grupos.map((g) => ({ chave: g.sprint.chave, nome: rotulo(g.sprint), quantidade: g.itens.length, cor: g.encerrada ? C.faint : g.cor }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: -6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Sprint</span>
          <MultiSelectFiltro
            rotuloTodos="Todas as sprints"
            opcoes={opcoesSprint}
            selecionados={sprintsSel}
            onChange={setSprintsSel}
            formatar={(k) => rotuloSprintPorChave.get(k) ?? k}
            pesquisavel
            placeholderBusca="Digite a sprint…"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Area Path</span>
          <MultiSelectFiltro
            rotuloTodos="Todas as áreas"
            opcoes={opcoesArea}
            selecionados={areasSel}
            onChange={setAreasSel}
            formatar={rotuloArea}
            pesquisavel
            placeholderBusca="Digite o nome da área…"
          />
        </div>
        {filtrando && (
          <button className="kmm-btn" onClick={() => { setSprintsSel([]); setAreasSel([]); }} title="Limpar os filtros de sprint e área">
            Limpar filtros
          </button>
        )}
      </div>

      <div className="kmm-card" style={{ padding: "16px 18px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 800, fontSize: 16, color: C.text }}>Volume por sprint</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {totalVisivel} {totalVisivel === 1 ? "item" : "itens"} em aberto · {grupos.length} {grupos.length === 1 ? "sprint" : "sprints"}{filtrando ? " (filtrado)" : ""}
            </div>
          </div>
          {qtdEncerradas > 0 && sprintsSel.length === 0 && (
            <button
              className="kmm-btn"
              aria-pressed={comEncerradas}
              style={comEncerradas ? { borderColor: C.orange, color: C.orange, background: "#FFF1EA" } : undefined}
              onClick={() => setComEncerradas((v) => !v)}
              title="Sprints que já terminaram e ainda têm PBIs em aberto"
            >
              {comEncerradas ? "Ocultar" : "Mostrar"} sprints encerradas ({qtdEncerradas})
            </button>
          )}
        </div>
        <div style={{ overflowX: "auto", overflowY: "hidden" }}>
          <div style={{ height: 220, marginTop: 8, minWidth: Math.max(0, dadosGrafico.length * LARGURA_BARRA) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosGrafico} margin={{ top: 22, right: 12, left: 12, bottom: 0 }}>
                <XAxis dataKey="chave" tickFormatter={(k: string) => dadosGrafico.find((d) => d.chave === k)?.nome ?? k} tickLine={false} axisLine={{ stroke: C.border }} interval={0} tick={{ fontSize: 11.5, fill: C.muted, fontWeight: 600 }} />
                <YAxis hide domain={[0, "dataMax + 2"]} />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  labelFormatter={(k: string) => {
                    const s = grupos.find((g) => g.sprint.chave === k)?.sprint;
                    return s ? `${s.nome} (${s.projeto})` : k;
                  }}
                  formatter={(v: number) => [`${v} ${v === 1 ? "item" : "itens"}`, "Em aberto"]}
                />
                <Bar dataKey="quantidade" radius={[10, 10, 10, 10]} maxBarSize={48} minPointSize={6} isAnimationActive={false}>
                  {dadosGrafico.map((d) => (
                    <Cell key={d.chave} fill={d.cor} />
                  ))}
                  <LabelList dataKey="quantidade" position="top" style={{ fontSize: 13, fontWeight: 700, fill: C.text }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {grupos.length === 0 && <p style={{ color: C.muted, margin: 0 }}>Nenhum PBI em aberto para os filtros selecionados.</p>}

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1180, display: "flex", flexDirection: "column", gap: 28 }}>
          {grupos.map((g) => {
            const aberto = !recolhidos[g.sprint.chave];
            const { inicio, fim } = g.sprint;
            return (
              <section key={g.sprint.chave}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0 10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setRecolhidos((r) => ({ ...r, [g.sprint.chave]: aberto }))}
                    aria-expanded={aberto}
                    title={aberto ? "Comprimir" : "Expandir"}
                    style={{ background: "none", border: "none", cursor: "pointer", color: g.cor, display: "flex", padding: 2 }}
                  >
                    <ChevronDown size={18} style={{ transform: aberto ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                  </button>
                  <span style={listaTituloGrupo(g.cor)}>{g.sprint.nome}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{g.itens.length}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999, background: C.soft, color: C.muted }}>{g.sprint.projeto}</span>
                  {inicio && fim && (
                    <span style={{ fontSize: 12, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                      {formatarChaveDia(inicio).slice(0, 5)} – {formatarChaveDia(fim).slice(0, 5)}
                    </span>
                  )}
                  {g.atual && <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999, background: "#FFF1EA", color: C.orange }}>Sprint atual</span>}
                  {g.encerrada && <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999, background: PASTEL.red.bg, color: PASTEL.red.dot }}>Encerrada</span>}
                </div>

                {aberto && (
                  <>
                    <div style={{ ...listaLinha(COLUNAS), marginBottom: 6, paddingLeft: 6 }}>
                      {["ID", "Título", "Cliente", "PO", "Squad", "Status", "Etapa", "Classificação"].map((h, i) => (
                        <div key={h} style={{ ...listaCabecalho, textAlign: i < 2 ? "left" : "center" }}>
                          {h}
                        </div>
                      ))}
                    </div>
                    {g.itens.map((i) => {
                      const estado = corDeEstadoDevOps(i.state);
                      const c = (centro = true, primeira = false): React.CSSProperties => ({ ...listaCelula({ cor: g.cor, primeira, centro }), color: C.text });
                      return (
                        <div key={i.id} style={listaLinha(COLUNAS)}>
                          <div style={{ ...c(false, true), fontVariantNumeric: "tabular-nums" }}>
                            <a
                              href={`https://dev.azure.com/${ORG_DEVOPS}/${encodeURIComponent(i.projeto)}/_workitems/edit/${i.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir o PBI no Azure DevOps"
                              style={{ color: C.blue, textDecoration: "none", fontWeight: 500 }}
                            >
                              {i.id}
                            </a>
                          </div>
                          <div style={{ ...c(false), fontWeight: 600 }} title={i.titulo}>
                            <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i.titulo}</span>
                          </div>
                          <div style={c()}>{i.cliente || "—"}</div>
                          <div style={{ ...c(), color: C.muted }}>{i.po || "—"}</div>
                          <div style={c()} title={i.areaPath}>{nomeCurtoDaSquad(i.areaPath) || "—"}</div>
                          <div style={{ ...c(), padding: 0, background: estado.bg, color: estado.fg, fontWeight: 600, whiteSpace: "nowrap" }}>{i.state || "—"}</div>
                          <div style={c()}>{i.etapa || "—"}</div>
                          <div style={c()}>{i.classificacao || "—"}</div>
                        </div>
                      );
                    })}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

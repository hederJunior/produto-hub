"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, corDeAreaTabela } from "@/lib/kmm-theme";
import { chaveDia, diasEntreChaves, formatarChaveDia } from "@/lib/datas";
import { nomeDaSquad } from "@/lib/backlog";
import { DIAS_ALERTA_AG_DEPLOY, type ItemAgDeploy } from "@/lib/ag-deploy";
import type { UltimoComentario } from "@/lib/gestao-clientes";
import { listaCabecalho, listaCelula, listaLinha, listaTituloGrupo } from "@/lib/kmm-lista";

const ORG_DEVOPS = "kmmbynstech";

// id | Título | Cliente | PO | Classificação | Resolved Date | Último comentário | Aging
const COLUNAS = "64px minmax(240px, 2.2fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(120px, 1fr) 110px minmax(260px, 2.2fr) 130px";

/** A rota de comentários aceita até 60 PBIs por chamada (app/api/clientes/pbis/comentarios). */
const LOTE_COMENTARIOS = 50;

/**
 * Downstream > "Ag. Deploy": lista de PBIs em Aguardando Deploy agrupada por Squad (Area Path, cor
 * registrada da Área), mesmo modelo do Refinamento Tech. Aging = dias desde a Resolved Date até hoje;
 * acima de DIAS_ALERTA_AG_DEPLOY dias ganha o indicador vermelho. O último comentário do PBI (aba
 * Discussão) é buscado à parte, em lotes, para a lista aparecer logo.
 */
export default function AgDeploy({ itens, hoje }: { itens: ItemAgDeploy[]; hoje: Date }) {
  const [recolhidos, setRecolhidos] = useState<Record<string, boolean>>({});
  // undefined = ainda não chegou; null = PBI sem comentário (ou falha ao ler).
  const [comentarios, setComentarios] = useState<Record<number, UltimoComentario | null>>({});
  const hojeChave = chaveDia(hoje);

  const grupos = useMemo(() => {
    const porArea = new Map<string, ItemAgDeploy[]>();
    for (const i of itens) porArea.set(i.areaPath, [...(porArea.get(i.areaPath) ?? []), i]);
    return Array.from(porArea.entries())
      .map(([areaPath, doGrupo]) => ({
        areaPath,
        squad: nomeDaSquad(areaPath),
        itens: doGrupo.sort((a, b) => a.id - b.id),
        cor: corDeAreaTabela(areaPath),
      }))
      .sort((a, b) => a.squad.localeCompare(b.squad, "pt-BR") || a.areaPath.localeCompare(b.areaPath));
  }, [itens]);

  // Busca o último comentário dos PBIs que têm comentário. Refaz quando a lista muda (inclui "Atualizar Dados").
  useEffect(() => {
    setComentarios({});
    const comComentario = itens.filter((i) => i.qtdComentarios > 0);
    if (!comComentario.length) return;
    let cancelado = false;
    (async () => {
      for (let n = 0; n < comComentario.length; n += LOTE_COMENTARIOS) {
        const lote = comComentario.slice(n, n + LOTE_COMENTARIOS);
        let recebidos: Record<number, UltimoComentario | null> = {};
        try {
          const res = await fetch("/api/clientes/pbis/comentarios", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itens: lote.map((i) => ({ id: i.id, projeto: i.projeto })) }),
          });
          recebidos = (await res.json()).comentarios ?? {};
        } catch {
          // Falha no lote: os PBIs dele mostram "—".
        }
        if (cancelado) return;
        setComentarios((atual) => {
          const novo = { ...atual };
          for (const i of lote) novo[i.id] = recebidos[i.id] ?? null;
          return novo;
        });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [itens]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: C.muted }}>
        {itens.length} {itens.length === 1 ? "item" : "itens"} em Aguardando Deploy
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1300, display: "flex", flexDirection: "column", gap: 28 }}>
          {grupos.map((g) => {
            const aberto = !recolhidos[g.areaPath];
            return (
              <section key={g.areaPath}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0 10px" }}>
                  <button
                    type="button"
                    onClick={() => setRecolhidos((r) => ({ ...r, [g.areaPath]: aberto }))}
                    aria-expanded={aberto}
                    title={aberto ? "Comprimir" : "Expandir"}
                    style={{ background: "none", border: "none", cursor: "pointer", color: g.cor.bg, display: "flex", padding: 2 }}
                  >
                    <ChevronDown size={18} style={{ transform: aberto ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                  </button>
                  <span style={listaTituloGrupo(g.cor.bg)}>{g.squad}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{g.itens.length}</span>
                </div>

                {aberto && (
                  <>
                    <div style={{ ...listaLinha(COLUNAS), marginBottom: 6, paddingLeft: 6 }}>
                      {["ID", "Título", "Cliente", "PO", "Classificação", "Resolved Date", "Último comentário", "Aging"].map((h, i) => (
                        <div key={h} style={{ ...listaCabecalho, textAlign: i < 2 ? "left" : "center" }}>
                          {h}
                        </div>
                      ))}
                    </div>
                    {g.itens.map((i) => {
                      const dias = i.resolvedDate ? Math.max(0, diasEntreChaves(chaveDia(i.resolvedDate), hojeChave)) : null;
                      const atrasado = dias != null && dias > DIAS_ALERTA_AG_DEPLOY;
                      const com = comentarios[i.id];
                      const aguardandoComentario = i.qtdComentarios > 0 && com === undefined;
                      const c = (centro = true, primeira = false): React.CSSProperties => ({ ...listaCelula({ cor: g.cor.bg, primeira, centro }), color: C.text });
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
                          <div style={c()}>{i.classificacao || "—"}</div>
                          <div style={{ ...c(), fontVariantNumeric: "tabular-nums" }}>{i.resolvedDate ? formatarChaveDia(chaveDia(i.resolvedDate)) : "—"}</div>
                          <div
                            style={{ ...c(false), color: com?.texto ? C.text : C.muted, fontSize: 12.5 }}
                            title={com?.texto ? `${com.autor}${com.data ? " · " + new Date(com.data).toLocaleDateString("pt-BR") : ""}\n${com.texto}` : undefined}
                          >
                            <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {aguardandoComentario ? "…" : com?.texto || "—"}
                            </span>
                          </div>
                          <div
                            style={{ ...c(), gap: 8, fontVariantNumeric: "tabular-nums", ...(atrasado ? { color: C.red, fontWeight: 700 } : {}) }}
                            title={dias != null ? `${dias} dias desde a Resolved Date${atrasado ? ` (mais de ${DIAS_ALERTA_AG_DEPLOY})` : ""}` : "Sem Resolved Date"}
                          >
                            {atrasado && (
                              <span
                                role="img"
                                aria-label={`Há ${dias} dias aguardando deploy`}
                                style={{ width: 12, height: 12, borderRadius: "50%", background: C.red, boxShadow: "0 0 0 3px #FBE7E4", display: "inline-block", flexShrink: 0 }}
                              />
                            )}
                            {dias != null ? `${dias} ${dias === 1 ? "dia" : "dias"}` : "—"}
                          </div>
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

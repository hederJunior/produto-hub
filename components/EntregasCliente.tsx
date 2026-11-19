"use client";

import { useEffect, useState } from "react";
import { Check, Rocket } from "lucide-react";
import { C, PASTEL, corDeEstadoDevOps } from "@/lib/kmm-theme";
import { chaveDia, formatarChaveDia } from "@/lib/datas";
import { estaFinalizado, tituloComIdExterno, versaoPrevistaDaSprint, type EntregasCliente as Entregas, type PbiEntrega } from "@/lib/entregas-cliente";

/**
 * Gestão de clientes > "Demandas entregues" (pedido por Heder em 2026-11-04): seção leve, de leitura,
 * com os últimos lançamentos de versão, as últimas demandas finalizadas e as próximas entregas do
 * cliente escolhido. "Próximas entregas" (regra de 2026-11-19, a mesma de Downstream > Previsão de
 * Entregas): PBIs em aberto do cliente ou do KMM (INTERNO) programados para a sprint atual ou posterior
 * (Iteration do PBI), em ordem cronológica de sprint.
 */

const ORG_DEVOPS = "kmmbynstech";

const TITULO_BLOCO: React.CSSProperties = { fontFamily: "Sora,sans-serif", fontWeight: 400, fontSize: 21, color: C.text, margin: "0 0 14px", letterSpacing: "-.005em" };

const linkPbi = (p: { projeto: string; id: number }) => `https://dev.azure.com/${ORG_DEVOPS}/${encodeURIComponent(p.projeto)}/_workitems/edit/${p.id}`;

/** "qui, 04/11/2026" a partir de um instante ISO. */
function dataCurta(iso: string): string {
  const chave = chaveDia(iso);
  const [a, m, d] = chave.split("-").map(Number);
  const semana = new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${semana}, ${formatarChaveDia(chave)}`;
}

const Pilula = ({ bg, fg, children, title }: { bg: string; fg: string; children: React.ReactNode; title?: string }) => (
  <span title={title} style={{ display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap", flexShrink: 0 }}>
    {children}
  </span>
);

const Esqueleto = ({ linhas }: { linhas: number }) => (
  <div aria-hidden="true">
    {Array.from({ length: linhas }, (_, i) => (
      <div key={i} style={{ height: 14, borderRadius: 7, background: C.soft, margin: "16px 0", width: `${88 - ((i * 13) % 34)}%` }} />
    ))}
  </div>
);

const Vazio = ({ texto }: { texto: string }) => <p style={{ color: C.faint, fontSize: 13.5, margin: "6px 0" }}>{texto}</p>;

export default function EntregasCliente({ cliente, produto }: { cliente: string; produto: string }) {
  const [dados, setDados] = useState<Entregas | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setDados(null);
    setErro(null);
    fetch(`/api/clientes/entregas?produto=${produto}&cliente=${encodeURIComponent(cliente)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        if (cancelado) return;
        if (j.erro) setErro(j.erro);
        setDados({ lancamentos: j.lancamentos ?? [], finalizadas: j.finalizadas ?? [], previsao: j.previsao ?? [], avisoPrevisao: j.avisoPrevisao });
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar as demandas entregues."));
    return () => {
      cancelado = true;
    };
  }, [cliente, produto]);

  const hojeChave = chaveDia(new Date());

  return (
    <div className="kmm-card" style={{ padding: "30px 34px 34px" }}>
      {erro && <div style={{ fontSize: 13, color: C.red, marginBottom: 14 }}>{erro}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "34px 56px", alignItems: "flex-start" }}>
        {/* Lançamentos de versão: coluna principal, ocupa o espaço horizontal que sobra */}
        <section style={{ flex: "3 1 440px", minWidth: 0 }} aria-label="Lançamentos de versão">
          <h3 style={TITULO_BLOCO}>Lançamentos de versão</h3>
          {!dados ? (
            <Esqueleto linhas={6} />
          ) : dados.lancamentos.length === 0 ? (
            <Vazio texto="Nenhum PBI com versão informada para este cliente." />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {dados.lancamentos.map((p) => (
                <LinhaLancamento key={p.id} p={p} />
              ))}
            </ul>
          )}
        </section>

        {/* Lateral direita: últimos itens finalizados e, logo abaixo, a previsão das próximas entregas */}
        <div style={{ flex: "2 1 340px", minWidth: 0 }}>
          <section aria-label="Últimas demandas finalizadas">
            <h3 style={TITULO_BLOCO}>Últimos itens finalizados</h3>
            {!dados ? (
              <Esqueleto linhas={5} />
            ) : dados.finalizadas.length === 0 ? (
              <Vazio texto="Nenhuma demanda finalizada ainda para este cliente." />
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {dados.finalizadas.map((p, i) => (
                  <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                    <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", background: PASTEL.green.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Check size={12} color={PASTEL.green.dot} strokeWidth={3} />
                    </span>
                    <a href={linkPbi(p)} target="_blank" rel="noopener noreferrer" title={tituloComIdExterno(p.idExterno, p.titulo)} style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: C.text, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tituloComIdExterno(p.idExterno, p.titulo)}
                    </a>
                    <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{p.closedDate ? dataCurta(p.closedDate) : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Próximas entregas: PBIs do cliente + KMM (INTERNO) em sprint atual ou posterior */}
          <section style={{ marginTop: 44 }} aria-label="Próximas entregas">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <h3 style={{ ...TITULO_BLOCO, margin: 0 }}>Próximas entregas</h3>
              {dados && dados.previsao.length > 0 && (
                <span style={{ fontSize: 12, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                  {dados.previsao.length} {dados.previsao.length === 1 ? "demanda" : "demandas"}
                </span>
              )}
            </div>
            {dados?.avisoPrevisao && <div style={{ fontSize: 12.5, color: "#8a5a00", background: "#fff6e0", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>{dados.avisoPrevisao}</div>}
            {!dados ? (
              <Esqueleto linhas={4} />
            ) : dados.previsao.length === 0 ? (
              <Vazio texto="Nenhuma demanda programada para a sprint atual ou posteriores." />
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 400, overflowY: "auto" }}>
                {dados.previsao.map((p, i) => {
                  const estado = corDeEstadoDevOps(p.state);
                  const atual = !!p.sprintInicio && !!p.sprintFim && p.sprintInicio <= hojeChave && hojeChave <= p.sprintFim;
                  // Versão prevista = sprint do PBI ("Sprint 8.21" → "v8.21"); sprint sem número de versão mostra o próprio nome.
                  const versao = versaoPrevistaDaSprint(p.sprint);
                  const corVersao = atual ? PASTEL.orange : PASTEL.green;
                  const datas = p.sprintInicio && p.sprintFim ? ` (${formatarChaveDia(p.sprintInicio).slice(0, 5)} – ${formatarChaveDia(p.sprintFim).slice(0, 5)})` : "";
                  return (
                    <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
                      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${C.blue}`, color: C.blue, fontSize: 11.5, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <a href={linkPbi({ projeto: p.projeto, id: p.id })} target="_blank" rel="noopener noreferrer" title={tituloComIdExterno(p.idExterno, p.titulo)} style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.text, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tituloComIdExterno(p.idExterno, p.titulo)}
                      </a>
                      {p.interno && <Pilula bg={C.soft} fg={C.muted} title="PBI do cliente KMM (INTERNO)">Interno</Pilula>}
                      <Pilula bg={estado.bg} fg={estado.fg} title={`Status atual: ${p.state}`}>{p.state}</Pilula>
                      <Pilula bg={corVersao.bg} fg={corVersao.dot} title={`Versão prevista: ${p.sprint}${datas}${atual ? " — sprint atual" : ""}`}>
                        {versao ? `v${versao}` : p.sprint}
                      </Pilula>
                    </li>
                  );
                })}
              </ol>
            )}
            <p style={{ margin: "8px 0 0", fontSize: 12, color: C.faint }}>Demandas em aberto do cliente e do KMM (INTERNO) programadas para a sprint atual ou posteriores. A versão prevista é a sprint do PBI.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function LinhaLancamento({ p }: { p: PbiEntrega }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0" }}>
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${PASTEL.green.dot}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Rocket size={11} color={PASTEL.green.dot} />
      </span>
      <a href={linkPbi(p)} target="_blank" rel="noopener noreferrer" title={tituloComIdExterno(p.idExterno, p.titulo)} style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.text, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {tituloComIdExterno(p.idExterno, p.titulo)}
      </a>
      {p.interno && <Pilula bg={C.soft} fg={C.muted} title="PBI do cliente KMM (INTERNO)">Interno</Pilula>}
      {!estaFinalizado(p.state) && <Pilula bg={PASTEL.amber.bg} fg={PASTEL.amber.dot} title={`Status atual: ${p.state}`}>{p.state}</Pilula>}
      <Pilula bg={PASTEL.green.bg} fg={PASTEL.green.dot} title={p.versaoBruta !== p.versao ? `Campo Versão: ${p.versaoBruta}` : undefined}>
        v{p.versao}
      </Pilula>
    </li>
  );
}

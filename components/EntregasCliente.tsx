"use client";

import { useEffect, useState } from "react";
import { Check, Rocket } from "lucide-react";
import { C, PASTEL } from "@/lib/kmm-theme";
import { chaveDia, formatarChaveDia } from "@/lib/datas";
import { estaFinalizado, LIMITE_PREVISAO, type EntregasCliente as Entregas, type PbiEntrega } from "@/lib/entregas-cliente";
import { norm, type PbiGestaoCliente } from "@/lib/gestao-clientes";

/**
 * Gestão de clientes > "Demandas entregues" (pedido por Heder em 2026-11-04): seção leve, de leitura,
 * com os últimos lançamentos de versão, as últimas demandas finalizadas e a previsão das próximas
 * entregas do cliente escolhido. A previsão ainda é EXEMPLO (a regra de consulta não foi definida):
 * usa PBIs do cliente que já estão perto de sair (Aguardando Deploy, Teste Aceite Usuário, Execução).
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

/** Cor do rótulo de status nas "próximas entregas". */
function pastelDoEstado(state: string) {
  const s = norm(state);
  if (s === "aguardando deploy") return PASTEL.green;
  if (s.startsWith("teste aceite")) return PASTEL.sky;
  return PASTEL.amber;
}

/** Quanto mais perto de sair, mais cedo na lista de exemplo. */
const PESO_PREVISAO: Record<string, number> = { "aguardando deploy": 0, "teste aceite usuario": 1, execucao: 2 };

export default function EntregasCliente({ cliente, produto, itensCliente }: { cliente: string; produto: string; itensCliente: PbiGestaoCliente[] }) {
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
        setDados({ lancamentos: j.lancamentos ?? [], finalizadas: j.finalizadas ?? [] });
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar as demandas entregues."));
    return () => {
      cancelado = true;
    };
  }, [cliente, produto]);

  const previsao = itensCliente
    .filter((p) => norm(p.state) in PESO_PREVISAO)
    .sort((a, b) => PESO_PREVISAO[norm(a.state)] - PESO_PREVISAO[norm(b.state)] || b.id - a.id)
    .slice(0, LIMITE_PREVISAO);

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

        {/* Últimas demandas finalizadas: lateral direita */}
        <section style={{ flex: "2 1 340px", minWidth: 0 }} aria-label="Últimas demandas finalizadas">
          <h3 style={TITULO_BLOCO}>Finalizadas recentemente</h3>
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
                  <a href={linkPbi(p)} target="_blank" rel="noopener noreferrer" title={p.titulo} style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: C.text, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.titulo}
                  </a>
                  <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{p.closedDate ? dataCurta(p.closedDate) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Previsão das próximas entregas (exemplo) */}
      <section style={{ marginTop: 42 }} aria-label="Próximas entregas">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <h3 style={{ ...TITULO_BLOCO, margin: 0 }}>Próximas entregas</h3>
          <Pilula bg={PASTEL.purple.bg} fg={PASTEL.purple.dot} title="A regra de consulta da previsão ainda será definida">Exemplo</Pilula>
        </div>
        {previsao.length === 0 ? (
          <Vazio texto="Sem demandas em andamento para este cliente." />
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {previsao.map((p, i) => {
              const cor = pastelDoEstado(p.state);
              return (
                <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0" }}>
                  <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${C.blue}`, color: C.blue, fontSize: 11.5, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <a href={linkPbi({ projeto: p.projeto, id: p.id })} target="_blank" rel="noopener noreferrer" title={p.titulo} style={{ minWidth: 0, fontSize: 13.5, color: C.text, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.titulo}
                  </a>
                  <Pilula bg={cor.bg} fg={cor.dot}>{p.state}</Pilula>
                </li>
              );
            })}
          </ol>
        )}
        <p style={{ margin: "8px 0 0", fontSize: 12, color: C.faint }}>Exemplo ilustrativo com demandas em andamento do cliente. A previsão real de entrega será definida em breve.</p>
      </section>
    </div>
  );
}

function LinhaLancamento({ p }: { p: PbiEntrega }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0" }}>
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${PASTEL.green.dot}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Rocket size={11} color={PASTEL.green.dot} />
      </span>
      <a href={linkPbi(p)} target="_blank" rel="noopener noreferrer" title={p.titulo} style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.text, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.titulo}
      </a>
      {p.interno && <Pilula bg={C.soft} fg={C.muted} title="PBI do cliente KMM (INTERNO)">Interno</Pilula>}
      {!estaFinalizado(p.state) && <Pilula bg={PASTEL.amber.bg} fg={PASTEL.amber.dot} title={`Status atual: ${p.state}`}>{p.state}</Pilula>}
      <Pilula bg={PASTEL.green.bg} fg={PASTEL.green.dot} title={p.versaoBruta !== p.versao ? `Campo Versão: ${p.versaoBruta}` : undefined}>
        v{p.versao}
      </Pilula>
    </li>
  );
}

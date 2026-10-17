"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProduto } from "@/components/ProdutoContext";
import { C } from "@/lib/kmm-theme";
import PageHeader from "@/components/PageHeader";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import DistribuicaoPorStatus from "@/components/DistribuicaoPorStatus";
import { DemandasAguardandoPriorizacao, DivisorSecao, LinhaBacklogOrcamento } from "@/components/BaseGeralDemandas";
import { Users } from "lucide-react";
import { nomeCurtoDaSquad } from "@/lib/backlog";
import { formatarChaveDia } from "@/lib/datas";
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

/** Colunas da tabela, na ordem exibida. */
const COLUNAS = ["Chamado", "Tarefa", "PBI", "Status no board", "Data abertura produto", "Etapa", "PO", "Esteira", "Classificação", "Observação"];

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
  // Cliente: seleção ÚNICA e obrigatória (pedido por Heder em 2026-10-17) — a tela só mostra dados
  // depois que um cliente é escolhido. null = nada escolhido ainda.
  const [clienteSel, setClienteSel] = useState<string | null>(null);
  // Filtro "Squad" = Area Path do PBI (valor completo, ex. "KMM5\TMS - Dedicada Maroni").
  const [squadsSel, setSquadsSel] = useState<string[]>([]);
  // Observação (último comentário) chega depois da tabela, em lotes: id → comentário | null.
  const [comentarios, setComentarios] = useState<Record<number, UltimoComentario | null>>({});
  const geracao = useRef(0);
  // Ids cujo comentário já foi pedido (evita repetir ao trocar de cliente e voltar).
  const comentariosPedidos = useRef<Set<number>>(new Set());

  useEffect(() => {
    const minha = ++geracao.current;
    setCarregando(true);
    setErro(null);
    setComentarios({});
    comentariosPedidos.current = new Set();
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

  // Se a lista de clientes mudar (troca de produto) e o escolhido não existir mais, volta a "nada escolhido".
  useEffect(() => {
    setClienteSel((sel) => (sel && !opcoesCliente.includes(sel) ? null : sel));
  }, [opcoesCliente]);

  // Observação (último comentário): só dos PBIs do cliente escolhido, sob demanda — antes de escolher
  // um cliente nada é exibido, então buscar os comentários de todos seria trabalho jogado fora.
  useEffect(() => {
    if (!clienteSel) return;
    const pendentes = itens.filter((p) => clienteDe(p) === clienteSel && p.qtdComentarios > 0 && !comentariosPedidos.current.has(p.id));
    if (!pendentes.length) return;
    pendentes.forEach((p) => comentariosPedidos.current.add(p.id));
    carregarComentarios(pendentes, geracao.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteSel, itens]);

  // Squads oferecidas = as do cliente escolhido (não adianta listar squad sem demanda dele).
  const opcoesSquad = useMemo(
    () =>
      Array.from(new Set(itens.filter((p) => clienteSel && clienteDe(p) === clienteSel).map((p) => p.areaPath).filter(Boolean))).sort((a, b) =>
        nomeCurtoDaSquad(a).localeCompare(nomeCurtoDaSquad(b), "pt-BR")
      ),
    [itens, clienteSel]
  );
  useEffect(() => {
    setSquadsSel((sel) => sel.filter((s) => opcoesSquad.includes(s)));
  }, [opcoesSquad]);

  // Nome mostrado no filtro: o curto da squad; se o mesmo nome existe em KMM4 e KMM5 (ex. "Melhorias"),
  // acrescenta o projeto pra não haver duas opções iguais.
  const rotuloSquad = useMemo(() => {
    const repetidos = new Set<string>();
    const vistos = new Set<string>();
    for (const a of opcoesSquad) {
      const curto = nomeCurtoDaSquad(a);
      if (vistos.has(curto)) repetidos.add(curto);
      vistos.add(curto);
    }
    return (areaPath: string) => {
      const curto = nomeCurtoDaSquad(areaPath);
      return repetidos.has(curto) ? `${curto} (${areaPath.split("\\")[0]})` : curto;
    };
  }, [opcoesSquad]);

  const visiveis = useMemo(() => {
    if (!clienteSel) return [];
    const filtrados = itens.filter((p) => clienteDe(p) === clienteSel && (!squadsSel.length || squadsSel.includes(p.areaPath)));
    return filtrados.sort((a, b) => ordemDoStatus(a.state) - ordemDoStatus(b.state) || a.id - b.id);
  }, [itens, clienteSel, squadsSel]);

  const ind = useMemo(() => calcularIndicadoresGestao(visiveis), [visiveis]);
  const valor = (v: number | null) => (carregando ? "…" : v == null ? "—" : String(v));

  return (
    <div>
      <PageHeader
        titulo="Gestão de clientes"
        subtitulo="PBIs do Azure DevOps em Backlog, Orçamento, Execução, Teste Aceite Usuário e Aguardando Deploy."
      >
        <MultiSelectFiltro
          unico
          rotuloTodos={carregando ? "Carregando clientes…" : "Selecione um cliente"}
          opcoes={opcoesCliente}
          selecionados={clienteSel ? [clienteSel] : []}
          onChange={(v) => setClienteSel(v[0] ?? null)}
          pesquisavel
          placeholderBusca="Digite o nome do cliente…"
        />
        <MultiSelectFiltro
          rotuloTodos="Todas as squads"
          opcoes={opcoesSquad}
          selecionados={squadsSel}
          onChange={setSquadsSel}
          formatar={rotuloSquad}
          pesquisavel
          placeholderBusca="Digite o nome da squad…"
        />
      </PageHeader>

      {erro && <div className="kmm-card" style={{ marginBottom: 16, fontSize: 13, color: C.red }}>{erro}</div>}
      {avisos.map((a) => (
        <div key={a} className="kmm-card" style={{ marginBottom: 12, fontSize: 13, color: "#8a5a00", background: "#fff6e0" }}>{a}</div>
      ))}

      {!clienteSel ? (
        <EstadoSemCliente carregando={carregando} />
      ) : (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <KpiCard titulo="DEMANDAS EM BACKLOG" valor={valor(ind.demandasBacklog)} nota="Backlog nas etapas Backlog, Análise ou Comitê" />
        <KpiCard titulo="DEMANDAS EM ETAPA COMERCIAL" valor={valor(ind.demandasEtapaComercial)} nota="Orçamento + Backlog na etapa Relacionamento Comercial" />
        <KpiCard titulo="AGGING DE VIABILIDADE" valor={valor(ind.agingViabilidadeDias)} unidade="dias" nota="Idade média dos itens em Backlog (sem KMM INTERNO)" />
      </div>

      {/* Linha 1: Demandas em backlog + Demandas em orçamento. */}
      <LinhaBacklogOrcamento itens={visiveis} carregando={carregando} />

      {/* Linha 2: base geral (tabela completa) + painel "Distribuição por status". */}
      <DivisorSecao titulo="Base geral de demandas" />

      {/* Tabela à esquerda; painel "Distribuição por status" na lateral direita (empilha só em tela estreita). */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 640px", minWidth: 0 }}>
      <div className="kmm-card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Área de rolagem PRÓPRIA da tabela (altura limitada à tela): sem isso a barra horizontal
            ficava no fim da lista inteira, fora da vista, e parecia que não havia rolagem. Aqui as
            barras (vertical e horizontal) ficam sempre visíveis e o cabeçalho acompanha a rolagem. */}
        <div className="kmm-rolagem" style={{ overflow: "auto", maxHeight: "calc(100vh - 370px)", minHeight: 300 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1500 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                {COLUNAS.map((h) => (
                  <th key={h} style={{ position: "sticky", top: 0, zIndex: 2, background: C.dark, padding: "11px 14px", fontSize: 12.5, color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr><td style={{ padding: 18, color: C.muted }} colSpan={COLUNAS.length}>Carregando…</td></tr>
              ) : visiveis.length === 0 ? (
                <tr><td style={{ padding: 18, color: C.muted }} colSpan={COLUNAS.length}>Nenhum PBI encontrado para os filtros atuais.</td></tr>
              ) : (
                visiveis.map((p, i) => {
                  const cor = corDoStatus(p.state);
                  const com = comentarios[p.id];
                  const aguardandoComentario = p.qtdComentarios > 0 && com === undefined;
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 ? "#FAF9F7" : "#fff", fontSize: 13.5, verticalAlign: "top" }}>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{p.idExterno || "—"}</td>
                      <td style={{ padding: "10px 14px", minWidth: 260 }} title={p.titulo}>
                        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.titulo}</span>
                      </td>
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
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {p.dataAberturaProduto ? formatarChaveDia(p.dataAberturaProduto.slice(0, 10)) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{p.etapa || "—"}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{p.po || "—"}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{nomeCurtoDaSquad(p.areaPath) || "—"}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{p.classificacao || "—"}</td>
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
      <div style={{ flex: "0 1 320px", minWidth: 280, position: "sticky", top: 16 }}>
        <DistribuicaoPorStatus itens={visiveis} carregando={carregando} />
      </div>
      </div>

      {/* Linha 3: Demandas aguardando priorização. */}
      <div style={{ marginTop: 24 }}>
        <DemandasAguardandoPriorizacao itens={visiveis} carregando={carregando} />
      </div>
      </>
      )}
    </div>
  );
}

/** Tela antes de escolher o cliente: nada é exibido até haver uma seleção (pedido por Heder em 2026-10-17). */
function EstadoSemCliente({ carregando }: { carregando: boolean }) {
  return (
    <div className="kmm-card" style={{ textAlign: "center", padding: "56px 24px" }}>
      <div style={{ width: 54, height: 54, borderRadius: 14, background: "#FFF1EA", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Users size={26} color={C.orange} />
      </div>
      <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 700, fontSize: 18, color: C.text }}>
        {carregando ? "Carregando clientes…" : "Selecione um cliente"}
      </div>
      <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>
        {carregando ? "Buscando os PBIs no Azure DevOps." : "Escolha um cliente no filtro acima para ver os indicadores e as demandas."}
      </div>
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

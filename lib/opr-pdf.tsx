/**
 * OPR em PDF da Gestão de clientes (pedido por Heder em 2026-11-24). Gera, NO NAVEGADOR, um PDF A4
 * paisagem com tudo o que a tela mostra para o cliente/squads filtrados: identificação, distribuição
 * por status, listagem completa, backlog + aging, aguardando aceite comercial, execução, testes do
 * usuário e demandas entregues. Visual do documento-modelo "Justificativa de cronograma" (Helvetica,
 * laranja nstech, cabeçalhos de tabela laranja, filetes finos) com o logo kmm by nstech.
 *
 * Só recebe dados já carregados pela tela (nada de fetch aqui) — por isso o PDF é fiel ao que está
 * filtrado. Módulo carregado sob demanda (import dinâmico no clique) para o @react-pdf/renderer
 * não entrar no bundle da página.
 */
import { Document, Font, Image, Link, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PASTEL } from "@/lib/kmm-theme";
import { nomeCurtoDaSquad } from "@/lib/backlog";
import { chaveDia, formatarChaveDia } from "@/lib/datas";
import { agingDiasPbi, calcularIndicadoresGestao, emBacklogDemanda, norm, type PbiGestaoCliente, type UltimoComentario } from "@/lib/gestao-clientes";
import { estaFinalizado, tituloComIdExterno, versaoPrevistaDaSprint, type EntregasCliente } from "@/lib/entregas-cliente";
import { LINHAS_DISTRIBUICAO } from "@/components/DistribuicaoPorStatus";
import { FAIXAS_AGING } from "@/components/BaseGeralDemandas";

const ORG_DEVOPS = "kmmbynstech";

/** Sem hifenização automática: quebra só nos espaços (títulos com siglas e códigos ficam legíveis). */
Font.registerHyphenationCallback((palavra) => [palavra]);

const COR = {
  laranja: "#FF3D00",
  laranjaSuave: "#F2A57A",
  texto: "#1B1B1B",
  cinza: "#6B6B6B",
  borda: "#DDDDDD",
  faixa: "#F4F4F4",
  zebra: "#FAFAFA",
  destaque: "#FFF0EB",
  link: "#1F5FA8",
};

const S = StyleSheet.create({
  pagina: { paddingTop: 74, paddingBottom: 46, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 8, color: COR.texto, lineHeight: 1.3 },
  cabecalho: { position: "absolute", top: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 6, borderBottomWidth: 1.2, borderBottomColor: COR.laranja },
  cabecalhoTexto: { fontSize: 8, color: COR.cinza },
  rodape: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: COR.cinza },
  eyebrow: { fontSize: 9, fontFamily: "Helvetica-Bold", color: COR.laranja, letterSpacing: 0.4 },
  tituloDoc: { fontSize: 24, fontFamily: "Helvetica-Bold", marginTop: 4 },
  subtituloDoc: { fontSize: 11, color: COR.cinza, marginTop: 3, marginBottom: 14 },
  secaoTitulo: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COR.laranja, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: COR.laranja, marginBottom: 9 },
  subtitulo: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  legenda: { fontSize: 7.5, color: COR.cinza, marginTop: 1 },
  linhaTitulo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 5 },
});

/** Texto vindo do Azure: tira o que a fonte padrão do PDF não desenha (emoji etc.), para não sair lixo. */
function t(valor: string | null | undefined): string {
  return String(valor ?? "")
    .replace(/[\u0000-\u001F]+/g, " ")
    .replace(/[^ -ÿ–—‘’“”•…€™]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
const truncar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const dataCurta = (iso: string | null) => (iso ? formatarChaveDia(iso.slice(0, 10)) : "—");
const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const linkPbi = (p: { projeto: string; id: number }) => `https://dev.azure.com/${ORG_DEVOPS}/${encodeURIComponent(p.projeto)}/_workitems/edit/${p.id}`;

function corDoStatus(state: string): string {
  return LINHAS_DISTRIBUICAO.find((l) => norm(l.estado) === norm(state))?.cor ?? COR.cinza;
}

// ---------------------------------------------------------------- tabela

type Cel = string | { t: string; href?: string; bold?: boolean; status?: string; cor?: string };
type Coluna = { titulo: string; peso: number; direita?: boolean; /** Limite de linhas da célula (texto longo vira "…"), como na tela. */ linhas?: number };

function Tabela({ colunas, linhas, vazio, leve }: { colunas: Coluna[]; linhas: Cel[][]; vazio: string; leve?: boolean }) {
  const soma = colunas.reduce((n, c) => n + c.peso, 0);
  const largura = (c: Coluna) => `${(c.peso / soma) * 100}%`;
  const celula = { paddingHorizontal: 4, paddingVertical: 3.5 };
  return (
    <View>
      {/* Cabeçalho repetido em cada página quando a tabela quebra. */}
      <View fixed style={{ flexDirection: "row", backgroundColor: leve ? COR.faixa : COR.laranja, borderBottomWidth: leve ? 1 : 0, borderBottomColor: COR.laranja }}>
        {colunas.map((c) => (
          <Text key={c.titulo} style={{ ...celula, width: largura(c), fontFamily: "Helvetica-Bold", fontSize: 7.5, color: leve ? COR.texto : "#FFFFFF", textAlign: c.direita ? "right" : "left" }}>
            {c.titulo}
          </Text>
        ))}
      </View>
      {linhas.length === 0 ? (
        <Text style={{ ...celula, paddingVertical: 8, color: COR.cinza, borderBottomWidth: 0.5, borderBottomColor: COR.borda }}>{vazio}</Text>
      ) : (
        linhas.map((cels, i) => (
          <View key={i} wrap={false} style={{ flexDirection: "row", backgroundColor: i % 2 ? COR.zebra : "#FFFFFF", borderBottomWidth: 0.5, borderBottomColor: COR.borda }}>
            {cels.map((cel, j) => {
              const o = typeof cel === "string" ? { t: cel } : cel;
              const col = colunas[j];
              const base = { ...(col.linhas ? ({ maxLines: col.linhas } as object) : {}), fontSize: 7.5, textAlign: col.direita ? ("right" as const) : ("left" as const), fontFamily: o.bold ? "Helvetica-Bold" : "Helvetica", color: o.cor ?? COR.texto };
              return (
                <View key={j} style={{ ...celula, width: largura(col) }}>
                  {o.status ? (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: corDoStatus(o.status), marginRight: 4 }} />
                      <Text style={{ ...base, fontFamily: "Helvetica-Bold", color: corDoStatus(o.status), flex: 1 }}>{o.t}</Text>
                    </View>
                  ) : o.href ? (
                    // Link dentro de um Text: o limite de linhas só vale no Text.
                    <Text style={{ ...base, color: COR.link }}>
                      <Link src={o.href} style={{ color: COR.link, textDecoration: "none" }}>
                        {o.t}
                      </Link>
                    </Text>
                  ) : (
                    <Text style={base}>{o.t}</Text>
                  )}
                </View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

/**
 * Título de seção + conteúdo como filhos DIRETOS da página: é só assim que `minPresenceAhead` funciona
 * (título não fica órfão no pé da página, sem as primeiras linhas da tabela). `quebra` = nova página.
 */
function Secao({ n, titulo, quebra, children }: { n: number; titulo: string; quebra?: boolean; children: React.ReactNode }) {
  return (
    <>
      <Text break={quebra} minPresenceAhead={110} style={quebra ? S.secaoTitulo : { ...S.secaoTitulo, marginTop: 18 }}>
        {n}. {titulo}
      </Text>
      {children}
    </>
  );
}

function Cabecalho({ cliente }: { cliente: string }) {
  return (
    <View fixed style={S.cabecalho}>
      <Image src={`${typeof window !== "undefined" ? window.location.origin : ""}/logo-kmm-nstech.png`} style={{ height: 30, width: 30 * (1772 / 818) }} />
      <Text style={S.cabecalhoTexto}>OPR | Gestão de clientes — {t(cliente)}</Text>
    </View>
  );
}

function Rodape({ cliente }: { cliente: string }) {
  return (
    <View fixed style={S.rodape}>
      <Text>kmm by nstech | OPR — {t(cliente)}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

// ---------------------------------------------------------------- blocos

function Distribuicao({ itens }: { itens: PbiGestaoCliente[] }) {
  const total = itens.length;
  const linhas = LINHAS_DISTRIBUICAO.map((l) => {
    const qtd = itens.filter((p) => norm(p.state) === norm(l.estado)).length;
    return { ...l, qtd, pct: total ? Math.round((qtd / total) * 100) : 0 };
  });
  return (
    <View>
      <Text style={S.legenda}>Volume de demandas por etapa da esteira.</Text>
      <View style={{ marginTop: 8 }}>
        {linhas.map((l) => (
          <View key={l.estado} wrap={false} style={{ marginBottom: 9 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: l.cor, marginRight: 7 }} />
              <Text style={{ flex: 1, fontSize: 9.5 }}>{l.rotulo}</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5, width: 40, textAlign: "right" }}>{l.qtd}</Text>
              <Text style={{ fontSize: 8.5, color: COR.cinza, width: 36, textAlign: "right" }}>{l.pct}%</Text>
            </View>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: "#EFEFEF", marginTop: 4 }}>
              <View style={{ width: `${l.pct}%`, height: 5, borderRadius: 3, backgroundColor: l.cor }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function GraficoAging({ backlog, agora }: { backlog: PbiGestaoCliente[]; agora: number }) {
  const agings = backlog.map((p) => agingDiasPbi(p, agora));
  const dados = FAIXAS_AGING.map((f) => ({ faixa: f.rotulo, qtd: agings.filter((d) => d != null && f.contem(d)).length }));
  const semData = agings.filter((d) => d == null).length;
  if (semData > 0) dados.push({ faixa: "Sem data", qtd: semData });
  const maximo = Math.max(1, ...dados.map((d) => d.qtd));
  const ALTURA = 82;
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: ALTURA + 16 }}>
        {dados.map((d, i) => (
          <View key={d.faixa} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 2 }}>{d.qtd}</Text>
            <View style={{ width: 26, height: Math.max(2, (d.qtd / maximo) * ALTURA), backgroundColor: d.faixa === "> 45 dias" || i === dados.length - 1 ? COR.laranja : COR.laranjaSuave, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", borderTopWidth: 0.8, borderTopColor: COR.borda, paddingTop: 3 }}>
        {dados.map((d) => (
          <Text key={d.faixa} style={{ flex: 1, textAlign: "center", fontSize: 7, color: COR.cinza }}>
            {d.faixa}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Indicador({ cor, titulo, valor }: { cor: keyof typeof PASTEL; titulo: string; valor: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: PASTEL[cor].bg, borderRadius: 6, padding: "6 7" }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: PASTEL[cor].dot, marginRight: 4, marginTop: 2 }} />
        <Text style={{ fontSize: 6.8, color: COR.cinza, flex: 1, lineHeight: 1.25 }}>{titulo}</Text>
      </View>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 4 }}>{valor}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- documento

export type DadosOpr = {
  cliente: string;
  /** Rótulos das squads filtradas; vazio = todas. */
  squads: string[];
  geradoEm: Date;
  /** PBIs JÁ filtrados (cliente/squad), na ordem da tela. */
  itens: PbiGestaoCliente[];
  comentarios: Record<number, UltimoComentario | null>;
  /** null = não foi possível carregar (a seção mostra um aviso). */
  entregas: EntregasCliente | null;
  avisoEntregas?: string;
};

function OprDocument({ d }: { d: DadosOpr }) {
  const agora = d.geradoEm.getTime();
  const itens = d.itens;
  const ind = calcularIndicadoresGestao(itens, agora);
  const backlog = itens.filter(emBacklogDemanda);
  const orcamento = itens.filter((p) => norm(p.state) === "orcamento");
  const execucao = itens.filter((p) => norm(p.state) === "execucao");
  const testes = itens.filter((p) => norm(p.state) === "teste aceite usuario");
  const totalEffort = orcamento.reduce((n, p) => n + (p.effort ?? 0), 0);
  const obs = (p: PbiGestaoCliente) => {
    const c = d.comentarios[p.id];
    return c?.texto ? truncar(t(c.texto), 260) : "—";
  };
  const pbi = (p: PbiGestaoCliente): Cel => ({ t: String(p.id), href: linkPbi(p) });
  const squadDe = (p: PbiGestaoCliente) => t(nomeCurtoDaSquad(p.areaPath)) || "—";
  const dataGeracao = d.geradoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const horaGeracao = d.geradoEm.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const e = d.entregas;

  const infoLinhas: [string, string][] = [
    ["Cliente", t(d.cliente)],
    ["Squads", d.squads.length ? d.squads.map(t).join(", ") : "Todas as squads"],
    ["Posição em", `${dataGeracao} às ${horaGeracao}`],
    ["Demandas na visão", `${itens.length} (Backlog, Orçamento, Execução, Teste Aceite Usuário e Aguardando Deploy)`],
  ];

  return (
    <Document title={`OPR — ${t(d.cliente)}`} author="kmm by nstech" subject="OPR — Gestão de clientes">
      <Page size="A4" orientation="landscape" style={S.pagina}>
        <Cabecalho cliente={d.cliente} />
        <Rodape cliente={d.cliente} />

        {/* Página 1 — identificação do cliente + distribuição por status */}
        <Text style={S.eyebrow}>OPR · GESTÃO DE CLIENTES</Text>
        <Text style={S.tituloDoc}>{t(d.cliente)}</Text>
        <Text style={S.subtituloDoc}>Posição das demandas e entregas em {dataGeracao}</Text>

        <View style={{ borderWidth: 0.7, borderColor: COR.borda }}>
          {infoLinhas.map(([rotulo, valor], i) => (
            <View key={rotulo} style={{ flexDirection: "row", borderTopWidth: i ? 0.7 : 0, borderTopColor: COR.borda }}>
              <Text style={{ width: 130, backgroundColor: COR.faixa, fontFamily: "Helvetica-Bold", fontSize: 9, padding: "6 8" }}>{rotulo}</Text>
              <Text style={{ flex: 1, fontSize: 9, padding: "6 8" }}>{valor}</Text>
            </View>
          ))}
        </View>

        <Secao n={1} titulo="Distribuição por status">
          <Distribuicao itens={itens} />
        </Secao>

        {/* 2 — listagem completa */}
        <Secao n={2} titulo="Listagem de demandas" quebra>
          <Text style={{ ...S.legenda, marginBottom: 6 }}>{plural(itens.length, "demanda", "demandas")} na visão, na ordem do fluxo do board.</Text>
          <Tabela
            colunas={[
              { titulo: "Chamado", peso: 7 },
              { titulo: "Tarefa", peso: 21, linhas: 2 },
              { titulo: "PBI", peso: 5.5 },
              { titulo: "Status no board", peso: 9.5 },
              { titulo: "Abertura produto", peso: 7.5 },
              { titulo: "Etapa", peso: 8 },
              { titulo: "PO", peso: 8, linhas: 2 },
              { titulo: "Squad", peso: 8 },
              { titulo: "Classificação", peso: 7 },
              { titulo: "Observação", peso: 24, linhas: 3 },
            ]}
            linhas={itens.map((p) => [
              t(p.idExterno) || "—",
              t(p.titulo),
              pbi(p),
              { t: t(p.state), status: p.state },
              dataCurta(p.dataAberturaProduto),
              t(p.etapa) || "—",
              t(p.po) || "—",
              squadDe(p),
              t(p.classificacao) || "—",
              obs(p),
            ])}
            vazio="Nenhuma demanda para os filtros atuais."
          />
        </Secao>

        {/* 3 — aging (gráfico) + backlog (tabela) */}
        <Secao n={3} titulo="Backlog e aging" quebra>
          <View style={{ flexDirection: "row" }}>
            <View style={{ width: "30%", paddingRight: 16 }}>
              <Text style={S.subtitulo}>Demandas por faixa de aging</Text>
              <Text style={{ ...S.legenda, marginBottom: 10 }}>Dias em backlog, desde a abertura no produto.</Text>
              <GraficoAging backlog={backlog} agora={agora} />
              <View style={{ flexDirection: "row", marginTop: 14 }}>
                <Indicador cor="slate" titulo="Demandas em Backlog" valor={String(ind.demandasBacklog)} />
                <View style={{ width: 6 }} />
                <Indicador cor="amber" titulo="Agging de viabilidade" valor={ind.agingViabilidadeDias == null ? "—" : `${ind.agingViabilidadeDias} d`} />
                <View style={{ width: 6 }} />
                <Indicador cor="sky" titulo="Demandas c/comercial" valor={String(ind.demandasEtapaComercial)} />
              </View>
            </View>
            <View style={{ width: "70%" }}>
              <View style={S.linhaTitulo}>
                <Text style={S.subtitulo}>Demandas em backlog</Text>
                <Text style={{ fontSize: 8, color: COR.cinza }}>{plural(backlog.length, "demanda", "demandas")}</Text>
              </View>
              <Tabela
                colunas={[
                  { titulo: "Chamado", peso: 9 },
                  { titulo: "Tarefa", peso: 25, linhas: 2 },
                  { titulo: "PBI", peso: 7 },
                  { titulo: "Squad", peso: 10 },
                  { titulo: "PO", peso: 13, linhas: 2 },
                  { titulo: "Abertura produto", peso: 10 },
                  { titulo: "Etapa", peso: 10 },
                  { titulo: "Data comitê", peso: 8 },
                  { titulo: "Agging aberto", peso: 8, direita: true },
                ]}
                linhas={backlog.map((p) => {
                  const aging = agingDiasPbi(p, agora);
                  return [t(p.idExterno) || "—", t(p.titulo), pbi(p), squadDe(p), t(p.po) || "—", dataCurta(p.dataAberturaProduto), t(p.etapa) || "—", dataCurta(p.dataComite), { t: aging == null ? "—" : `${aging} d`, bold: true }];
                })}
                vazio="Nenhuma demanda em backlog para os filtros atuais."
              />
            </View>
          </View>
        </Secao>

        {/* 4 — aguardando aceite comercial (Orçamento) */}
        <Secao n={4} titulo="Demandas aguardando aceite comercial" quebra>
          <View style={S.linhaTitulo}>
            <Text style={S.legenda}>Demandas com status Orçamento.</Text>
            <Text style={{ fontSize: 8, color: COR.cinza }}>{plural(orcamento.length, "demanda", "demandas")}</Text>
          </View>
          <Tabela
            colunas={[
              { titulo: "Chamado", peso: 11 },
              { titulo: "Tarefa", peso: 55, linhas: 2 },
              { titulo: "PBI", peso: 9 },
              { titulo: "Data comitê", peso: 12 },
              { titulo: "Effort", peso: 13, direita: true },
            ]}
            linhas={orcamento.map((p) => [t(p.idExterno) || "—", t(p.titulo), pbi(p), dataCurta(p.dataComite), { t: p.effort == null ? "—" : `${numero(p.effort)} h`, bold: true }])}
            vazio="Nenhuma demanda em orçamento para os filtros atuais."
          />
          {orcamento.length > 0 && (
            <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: COR.destaque, borderLeftWidth: 3, borderLeftColor: COR.laranja, padding: "6 10", marginTop: 6 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: COR.laranja }}>TOTAL EFFORT</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>{numero(totalEffort)} h</Text>
            </View>
          )}
        </Secao>

        {/* 5 e 6 — execução e testes do usuário (tabelas, sem gráficos) */}
        <Secao n={5} titulo="Demandas em execução">
          <TabelaPorStatus itens={execucao} vazio="Nenhuma demanda em execução para os filtros atuais." pbi={pbi} squadDe={squadDe} obs={obs} />
        </Secao>
        <Secao n={6} titulo="Demandas em testes do usuário">
          <TabelaPorStatus itens={testes} vazio="Nenhuma demanda em testes do usuário para os filtros atuais." pbi={pbi} squadDe={squadDe} obs={obs} />
        </Secao>

        {/* 7 — demandas entregues */}
        <Secao n={7} titulo="Demandas entregues" quebra>
          {!e ? (
            <Text style={{ color: COR.cinza }}>{d.avisoEntregas || "Não foi possível carregar as demandas entregues."}</Text>
          ) : (
            <View style={{ flexDirection: "row" }}>
              <View style={{ width: "55%", paddingRight: 18 }}>
                <Text style={{ ...S.subtitulo, marginBottom: 5 }}>Lançamentos de versão</Text>
                <Tabela
                  leve
                  colunas={[
                    { titulo: "Demanda", peso: 58, linhas: 1 },
                    { titulo: "Status", peso: 25 },
                    { titulo: "Versão", peso: 17 },
                  ]}
                  linhas={e.lancamentos.map((p) => [
                    { t: t(tituloComIdExterno(p.idExterno, p.titulo)) + (p.interno ? " (Interno)" : ""), href: linkPbi(p) },
                    estaFinalizado(p.state) ? "Finalizado" : t(p.state),
                    { t: `v${p.versao}`, bold: true, cor: "#22A55B" },
                  ])}
                  vazio="Nenhum PBI com versão informada para este cliente."
                />
              </View>
              <View style={{ width: "45%" }}>
                <Text style={{ ...S.subtitulo, marginBottom: 5 }}>Últimos itens finalizados</Text>
                <Tabela
                  leve
                  colunas={[
                    { titulo: "Demanda", peso: 72, linhas: 1 },
                    { titulo: "Finalizada em", peso: 28 },
                  ]}
                  linhas={e.finalizadas.map((p) => [{ t: t(tituloComIdExterno(p.idExterno, p.titulo)), href: linkPbi(p) }, p.closedDate ? formatarChaveDia(chaveDia(p.closedDate)) : "—"])}
                  vazio="Nenhuma demanda finalizada ainda para este cliente."
                />
                <View style={{ marginTop: 16 }}>
                  <View style={S.linhaTitulo}>
                    <Text style={S.subtitulo}>Próximas entregas</Text>
                    <Text style={{ fontSize: 8, color: COR.cinza }}>{plural(e.previsao.length, "demanda", "demandas")}</Text>
                  </View>
                  {e.avisoPrevisao ? <Text style={{ ...S.legenda, color: "#8a5a00", marginBottom: 4 }}>{t(e.avisoPrevisao)}</Text> : null}
                  <Tabela
                    leve
                    colunas={[
                      { titulo: "Demanda", peso: 50, linhas: 1 },
                      { titulo: "Status", peso: 28 },
                      { titulo: "Versão prevista", peso: 22 },
                    ]}
                    linhas={e.previsao.map((p) => {
                      const versao = versaoPrevistaDaSprint(p.sprint);
                      return [
                        { t: t(tituloComIdExterno(p.idExterno, p.titulo)) + (p.interno ? " (Interno)" : ""), href: linkPbi(p) },
                        t(p.state),
                        { t: versao ? `v${versao}` : t(p.sprint), bold: true, cor: "#22A55B" },
                      ];
                    })}
                    vazio="Nenhuma demanda programada para a sprint atual ou posteriores."
                  />
                </View>
              </View>
            </View>
          )}
        </Secao>
      </Page>
    </Document>
  );
}

function TabelaPorStatus({
  itens,
  vazio,
  pbi,
  squadDe,
  obs,
}: {
  itens: PbiGestaoCliente[];
  vazio: string;
  pbi: (p: PbiGestaoCliente) => Cel;
  squadDe: (p: PbiGestaoCliente) => string;
  obs: (p: PbiGestaoCliente) => string;
}) {
  return (
    <View>
      <Text style={{ ...S.legenda, marginBottom: 5, textAlign: "right" }}>{plural(itens.length, "demanda", "demandas")}</Text>
      <Tabela
        colunas={[
          { titulo: "Chamado", peso: 8 },
          { titulo: "PBI", peso: 6 },
          { titulo: "Título", peso: 22, linhas: 2 },
          { titulo: "Squad", peso: 9 },
          { titulo: "Etapa", peso: 11 },
          { titulo: "PO", peso: 11, linhas: 2 },
          { titulo: "Classificação", peso: 9 },
          { titulo: "Observação", peso: 24, linhas: 3 },
        ]}
        linhas={itens.map((p) => [t(p.idExterno) || "—", pbi(p), t(p.titulo), squadDe(p), t(p.etapa) || "—", t(p.po) || "—", t(p.classificacao) || "—", obs(p)])}
        vazio={vazio}
      />
    </View>
  );
}

/** Gera o PDF da OPR e devolve o arquivo (Blob). Roda no navegador. */
export async function gerarOprPdf(dados: DadosOpr): Promise<Blob> {
  return pdf(<OprDocument d={dados} />).toBlob();
}

/** Nome do arquivo: OPR-<cliente>-AAAA-MM-DD.pdf (sem acento e sem símbolos). */
export function nomeArquivoOpr(cliente: string, quando: Date): string {
  const slug = cliente
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `OPR-${slug || "cliente"}-${chaveDia(quando)}.pdf`;
}

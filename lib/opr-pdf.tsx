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
import { Document, Font, Image, Link, Page, Path, pdf, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { PASTEL } from "@/lib/kmm-theme";
import { chaveDia, formatarChaveDia } from "@/lib/datas";
import { agingDiasPbi, calcularIndicadoresGestao, emBacklogDemanda, norm, ordenarBacklog, ordenarExecucao, ordenarListagem, type PbiGestaoCliente, type UltimoComentario } from "@/lib/gestao-clientes";
import { estaFinalizado, tituloComIdExterno, versaoPrevistaDaSprint, type EntregasCliente } from "@/lib/entregas-cliente";
import { LINHAS_DISTRIBUICAO } from "@/components/DistribuicaoPorStatus";
import { ROTULO_BLOQUEIO, descreverMotivos, type LinhaBloqueio } from "@/lib/bloqueio-clientes";
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
  subtituloDoc: { fontSize: 11, color: COR.cinza, marginTop: 3, marginBottom: 10 },
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

/**
 * Layout das tabelas (opção 2 "Linhas em cartão", escolhida pelo Heder em 2026-11-24): sem moldura nem
 * preenchimento no cabeçalho; cada linha é um cartão cinza-claro de cantos arredondados, com espaço
 * entre eles. Valores numéricos em destaque (coluna alinhada à direita e em negrito) viram etiqueta.
 */
const TAB = {
  cabTexto: "#8A8F98",
  linhaFundo: "#F6F7F9",
  texto: "#1F2328",
  id: "#6B7280",
  link: "#E04300",
  etiquetaFundo: "#FFFFFF",
  etiquetaTexto: "#E04300",
};

function Tabela({ colunas, linhas, vazio }: { colunas: Coluna[]; linhas: Cel[][]; vazio: string }) {
  const soma = colunas.reduce((n, c) => n + c.peso, 0);
  const largura = (c: Coluna) => `${(c.peso / soma) * 100}%`;
  // Tabelas largas (muitas colunas) usam margens menores para sobrar espaço ao texto.
  const padH = colunas.length > 6 ? 6 : 9;
  const celula = { paddingHorizontal: padH, paddingVertical: colunas.length > 6 ? 4 : 4.5 };

  return (
    <View>
      {/* Cabeçalho repetido em cada página quando a tabela quebra. */}
      <View fixed style={{ flexDirection: "row", marginBottom: 3 }}>
        {colunas.map((c) => (
          <Text
            key={c.titulo}
            style={{ paddingHorizontal: padH, paddingVertical: 3, width: largura(c), fontFamily: "Helvetica-Bold", fontSize: 6.6, color: TAB.cabTexto, textAlign: c.direita ? "right" : "left", textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            {c.titulo}
          </Text>
        ))}
      </View>
      {linhas.length === 0 ? (
        <Text style={{ ...celula, color: COR.cinza }}>{vazio}</Text>
      ) : (
        linhas.map((cels, i) => (
          <View key={i} wrap={false} style={{ flexDirection: "row", alignItems: "center", backgroundColor: TAB.linhaFundo, borderRadius: 6, marginBottom: 2.5 }}>
            {cels.map((cel, j) => {
              const o = typeof cel === "string" ? { t: cel } : cel;
              const col = colunas[j];
              const ehId = col.titulo === "Chamado" || col.titulo === "PBI";
              const base = { ...(col.linhas ? ({ maxLines: col.linhas } as object) : {}), fontSize: 7.6, textAlign: col.direita ? ("right" as const) : ("left" as const), fontFamily: o.bold ? "Helvetica-Bold" : "Helvetica", color: o.cor ?? (ehId ? TAB.id : TAB.texto) };
              let conteudo: React.ReactNode;
              if (o.status) {
                conteudo = (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: corDoStatus(o.status), marginRight: 4 }} />
                    <Text style={{ ...base, fontFamily: "Helvetica-Bold", color: corDoStatus(o.status), flex: 1 }}>{o.t}</Text>
                  </View>
                );
              } else if (col.direita && o.bold) {
                conteudo = (
                  <View style={{ alignSelf: "flex-end", backgroundColor: TAB.etiquetaFundo, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.6, color: TAB.etiquetaTexto }}>{o.t}</Text>
                  </View>
                );
              } else if (o.href) {
                // Link dentro de um Text: o limite de linhas só vale no Text.
                conteudo = (
                  <Text style={{ ...base, color: TAB.link }}>
                    <Link src={o.href} style={{ color: TAB.link, textDecoration: "none" }}>
                      {o.t}
                    </Link>
                  </Text>
                );
              } else {
                conteudo = <Text style={base}>{o.t}</Text>;
              }
              return (
                <View key={j} style={{ ...celula, width: largura(col) }}>
                  {conteudo}
                </View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

/** Linha do total "Horas para aprovação": faixa laranja suave de cantos arredondados, no estilo das linhas. */
function TotalHoras({ valor }: { valor: string }) {
  return (
    <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#FFF0EB", borderRadius: 6, paddingVertical: 7, paddingHorizontal: 9, marginTop: 3 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: "#E04300" }}>Horas para aprovação</Text>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, color: "#E04300" }}>{valor}</Text>
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

/** Título de seção dentro de uma coluna (páginas com duas seções lado a lado). */
function TituloColuna({ n, titulo }: { n: number; titulo: string }) {
  return (
    <Text style={S.secaoTitulo}>
      {n}. {titulo}
    </Text>
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

// ---------------------------------------------------------------- demandas entregues

const limitar = (n: number) => ({ maxLines: n }) as object;
const VERDE = { solido: "#22A55B", bg: PASTEL.green.bg };
const LARANJA = { solido: COR.laranja, bg: PASTEL.orange.bg, texto: "#E04300" };

function Pilula({ texto, fg, bg }: { texto: string; fg: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 7, paddingVertical: 1.5, paddingHorizontal: 6, marginLeft: 5 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.6, color: fg }}>{texto}</Text>
    </View>
  );
}

/** Cartão branco de cantos arredondados com título, ponto colorido e contagem. */
function Cartao({ titulo, contagem, cor, children }: { titulo: string; contagem?: string; cor: string; children: React.ReactNode }) {
  return (
    <View style={{ borderWidth: 0.7, borderColor: "#E8E2DB", borderRadius: 9, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#FFFFFF" }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cor, marginRight: 7 }} />
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, flex: 1 }}>{titulo}</Text>
        {contagem ? <Text style={{ fontSize: 7.5, color: COR.cinza }}>{contagem}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Kpi({ valor, titulo, detalhe, cor }: { valor: string; titulo: string; detalhe: string; cor: { bg: string; dot: string } }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: cor.bg, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 13 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 20, color: cor.dot, marginRight: 11 }}>{valor}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.8 }}>{titulo}</Text>
        <Text style={{ fontSize: 7.2, color: COR.cinza, marginTop: 1 }}>{detalhe}</Text>
      </View>
    </View>
  );
}

function IconeCheck() {
  return (
    <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: VERDE.bg, alignItems: "center", justifyContent: "center", marginRight: 7, marginTop: 0.5 }}>
      <Svg width={8} height={8} viewBox="0 0 10 10">
        <Path d="M1.8 5.2 L4.1 7.4 L8.2 2.8" stroke={VERDE.solido} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

function ItemEntrega({ titulo, href, direita, icone, linhas = 1 }: { titulo: string; href: string; direita?: React.ReactNode; icone?: React.ReactNode; linhas?: number }) {
  return (
    <View wrap={false} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 1.7 }}>
      {icone}
      <Text style={{ flex: 1, fontSize: 7.9, color: COR.texto, ...limitar(linhas) }}>
        <Link src={href} style={{ color: COR.texto, textDecoration: "none" }}>
          {titulo}
        </Link>
      </Text>
      {direita}
    </View>
  );
}

/** Selo do grupo (versão ou sprint) + legenda + contagem; os itens ficam numa linha vertical, como numa linha do tempo. */
function GrupoLinhaDoTempo({ rotulo, fg, bg, legenda, qtd, linha, children }: { rotulo: string; fg: string; bg: string; legenda?: string; qtd: number; linha: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 5 }}>
      <View wrap={false} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
        <View style={{ backgroundColor: bg, borderRadius: 9, paddingVertical: 2, paddingHorizontal: 8 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: fg }}>{rotulo}</Text>
        </View>
        <Text style={{ flex: 1, fontSize: 7.2, color: COR.cinza, marginLeft: 7 }}>{legenda ?? ""}</Text>
        <Text style={{ fontSize: 7, color: COR.cinza }}>{plural(qtd, "demanda", "demandas")}</Text>
      </View>
      <View style={{ marginLeft: 9, paddingLeft: 10, borderLeftWidth: 1.2, borderLeftColor: linha }}>{children}</View>
    </View>
  );
}

function agrupar<T>(lista: T[], chave: (x: T) => string): { chave: string; itens: T[] }[] {
  const grupos: { chave: string; itens: T[] }[] = [];
  for (const x of lista) {
    const k = chave(x);
    const g = grupos.find((gr) => gr.chave === k);
    if (g) g.itens.push(x);
    else grupos.push({ chave: k, itens: [x] });
  }
  return grupos;
}

const Vazio = ({ texto }: { texto: string }) => <Text style={{ fontFamily: "Helvetica-Oblique", fontSize: 8, color: COR.cinza, paddingVertical: 4 }}>{texto}</Text>;

function DemandasEntregues({ e, aviso, hoje }: { e: EntregasCliente | null; aviso?: string; hoje: string }) {
  if (!e) {
    return (
      <View style={{ backgroundColor: PASTEL.amber.bg, borderRadius: 8, padding: "9 12" }}>
        <Text style={{ color: "#8a5a00", fontSize: 9 }}>{t(aviso) || "Não foi possível carregar as demandas entregues."}</Text>
      </View>
    );
  }
  const porVersao = agrupar(e.lancamentos, (p) => p.versao);
  const porSprint = agrupar(e.previsao, (p) => p.sprint);
  const datasDaSprint = (p: { sprintInicio: string | null; sprintFim: string | null }) =>
    p.sprintInicio && p.sprintFim ? `${formatarChaveDia(p.sprintInicio).slice(0, 5)} – ${formatarChaveDia(p.sprintFim).slice(0, 5)}` : "";

  return (
    <View>
      <View style={{ flexDirection: "row", marginBottom: 9 }}>
        <Kpi valor={String(porVersao.length)} titulo="Versões entregues" detalhe={`${plural(e.lancamentos.length, "demanda", "demandas")} nos últimos lançamentos`} cor={{ bg: PASTEL.green.bg, dot: VERDE.solido }} />
        <View style={{ width: 9 }} />
        <Kpi valor={String(e.finalizadas.length)} titulo="Itens finalizados" detalhe="os mais recentes do cliente" cor={{ bg: PASTEL.sky.bg, dot: PASTEL.sky.dot }} />
        <View style={{ width: 9 }} />
        <Kpi valor={String(e.previsao.length)} titulo="Próximas entregas" detalhe="sprint atual e seguintes" cor={{ bg: PASTEL.orange.bg, dot: LARANJA.texto }} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        {/* Esquerda: lançamentos de versão, agrupados por versão */}
        <View style={{ width: "54%", paddingRight: 8 }}>
          <Cartao titulo="Lançamentos de versão" contagem={e.lancamentos.length ? plural(e.lancamentos.length, "demanda", "demandas") : undefined} cor={VERDE.solido}>
            {porVersao.length === 0 ? (
              <Vazio texto="Nenhum PBI com versão informada para este cliente." />
            ) : (
              porVersao.map((g) => (
                <GrupoLinhaDoTempo key={g.chave} rotulo={`v${g.chave}`} fg="#FFFFFF" bg={VERDE.solido} qtd={g.itens.length} linha="#BFE6CD">
                  {g.itens.map((p) => (
                    <ItemEntrega
                      key={p.id}
                      linhas={2}
                      titulo={t(tituloComIdExterno(p.idExterno, p.titulo))}
                      href={linkPbi(p)}
                      direita={
                        <>
                          {p.interno ? <Pilula texto="Interno" fg={COR.cinza} bg={COR.faixa} /> : null}
                          {!estaFinalizado(p.state) ? <Pilula texto={t(p.state)} fg="#B26A00" bg={PASTEL.amber.bg} /> : null}
                        </>
                      }
                    />
                  ))}
                </GrupoLinhaDoTempo>
              ))
            )}
          </Cartao>
        </View>

        {/* Direita: últimos finalizados e próximas entregas */}
        <View style={{ width: "46%", paddingLeft: 8 }}>
          <Cartao titulo="Últimos itens finalizados" cor={PASTEL.sky.dot}>
            {e.finalizadas.length === 0 ? (
              <Vazio texto="Nenhuma demanda finalizada ainda para este cliente." />
            ) : (
              e.finalizadas.map((p) => (
                <ItemEntrega
                  key={p.id}
                  icone={<IconeCheck />}
                  titulo={t(tituloComIdExterno(p.idExterno, p.titulo))}
                  href={linkPbi(p)}
                  direita={<Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.2, color: COR.cinza, marginLeft: 6 }}>{p.closedDate ? formatarChaveDia(chaveDia(p.closedDate)).slice(0, 5) : ""}</Text>}
                />
              ))
            )}
          </Cartao>

          <View style={{ height: 8 }} />

          <Cartao titulo="Próximas entregas" contagem={e.previsao.length ? plural(e.previsao.length, "demanda", "demandas") : undefined} cor={LARANJA.solido}>
            {e.avisoPrevisao ? <Text style={{ fontSize: 7.4, color: "#8a5a00", backgroundColor: PASTEL.amber.bg, borderRadius: 5, padding: "4 7", marginBottom: 3 }}>{t(e.avisoPrevisao)}</Text> : null}
            {porSprint.length === 0 ? (
              <Vazio texto="Nenhuma demanda programada para a sprint atual ou posteriores." />
            ) : (
              porSprint.map((g) => {
                const ref = g.itens[0];
                const atual = !!ref.sprintInicio && !!ref.sprintFim && ref.sprintInicio <= hoje && hoje <= ref.sprintFim;
                const versao = versaoPrevistaDaSprint(ref.sprint);
                const datas = datasDaSprint(ref);
                const legenda = [atual ? "Sprint atual" : versao ? t(ref.sprint) : "", datas].filter(Boolean).join(" · ");
                return (
                  <GrupoLinhaDoTempo
                    key={g.chave}
                    rotulo={versao ? `v${versao}` : t(ref.sprint)}
                    fg={atual ? "#FFFFFF" : LARANJA.texto}
                    bg={atual ? LARANJA.solido : LARANJA.bg}
                    legenda={legenda}
                    qtd={g.itens.length}
                    linha="#F9C9B4"
                  >
                    {g.itens.map((p) => (
                      <ItemEntrega
                        key={p.id}
                        titulo={t(tituloComIdExterno(p.idExterno, p.titulo))}
                        href={linkPbi(p)}
                        direita={
                          <>
                            {p.interno ? <Pilula texto="Interno" fg={COR.cinza} bg={COR.faixa} /> : null}
                          </>
                        }
                      />
                    ))}
                  </GrupoLinhaDoTempo>
                );
              })
            )}
          </Cartao>
        </View>
      </View>

      <Text style={{ fontSize: 6.8, color: COR.cinza, marginTop: 6 }}>
        Próximas entregas: demandas em aberto do cliente e do KMM (INTERNO) do mesmo projeto, programadas para a sprint atual ou posteriores. A versão prevista é a sprint do PBI.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- documento

export type DadosOpr = {
  cliente: string;
  geradoEm: Date;
  /** PBIs JÁ filtrados (cliente/squad), na ordem da tela. */
  itens: PbiGestaoCliente[];
  comentarios: Record<number, UltimoComentario | null>;
  /** null = não foi possível carregar (a seção mostra um aviso). */
  entregas: EntregasCliente | null;
  avisoEntregas?: string;
  /** Cliente bloqueado para novas demandas (última verificação diária); null/ausente = não bloqueado. */
  bloqueio?: LinhaBloqueio | null;
};

/** Cliente "Bloqueado para novas demandas" (regra diária): cartão vermelho-claro abaixo da distribuição por status. */
function AvisoBloqueioPdf({ bloqueio }: { bloqueio: LinhaBloqueio }) {
  const verificado = new Date(bloqueio.verificadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <View wrap={false} style={{ marginTop: 12, backgroundColor: "#FDF1F0", borderLeftWidth: 3, borderLeftColor: "#DD3322", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.6, color: "#B42318" }}>{ROTULO_BLOQUEIO}</Text>
      <Text style={{ fontSize: 7.6, color: "#5C3A36", marginTop: 2 }}>{descreverMotivos(bloqueio)}.</Text>
      <Text style={{ fontSize: 6.8, color: "#8A6F6B", marginTop: 3 }}>Verificado em {verificado}.</Text>
    </View>
  );
}

/** Página 1: distribuição por status (30%) ao lado das demandas aguardando aceite comercial / escopo (70%). */
function Pagina1Bloco({ itens, orcamento, totalEffort, pbi, bloqueio }: { itens: PbiGestaoCliente[]; orcamento: PbiGestaoCliente[]; totalEffort: number; pbi: (p: PbiGestaoCliente) => Cel; bloqueio?: LinhaBloqueio | null }) {
  return (
    <View style={{ flexDirection: "row", marginTop: 14 }}>
      <View style={{ width: "30%", paddingRight: 18 }}>
        <TituloColuna n={1} titulo="Distribuição por status" />
        <Distribuicao itens={itens} />
        {bloqueio ? <AvisoBloqueioPdf bloqueio={bloqueio} /> : null}
      </View>
      <View style={{ width: "70%" }}>
        <TituloColuna n={2} titulo="Demandas aguardando aceite comercial / Escopo" />
        <View style={S.linhaTitulo}>
          <Text style={S.legenda}>Demandas com status Orçamento.</Text>
          <Text style={{ fontSize: 8, color: COR.cinza }}>{plural(orcamento.length, "demanda", "demandas")}</Text>
        </View>
        <Tabela
          colunas={[
            { titulo: "Chamado", peso: 11 },
            { titulo: "Tarefa", peso: 46, linhas: 2 },
            { titulo: "PBI", peso: 9 },
            { titulo: "Data comitê", peso: 12 },
            { titulo: "Effort", peso: 13, direita: true },
          ]}
          linhas={orcamento.map((p) => [
            t(p.idExterno) || "—",
            t(p.titulo),
            pbi(p),
            dataCurta(p.dataComite),
            { t: p.effort == null ? "—" : `${numero(p.effort)} h`, bold: true },
          ])}
          vazio="Nenhuma demanda em orçamento para os filtros atuais."
        />
        {orcamento.length > 0 && <TotalHoras valor={`${numero(totalEffort)} h`} />}
      </View>
    </View>
  );
}

function OprDocument({ d }: { d: DadosOpr }) {
  const agora = d.geradoEm.getTime();
  const itens = ordenarListagem(d.itens);
  const ind = calcularIndicadoresGestao(itens, agora);
  const backlog = ordenarBacklog(itens.filter(emBacklogDemanda));
  const orcamento = itens.filter((p) => norm(p.state) === "orcamento");
  const execucao = ordenarExecucao(itens.filter((p) => norm(p.state) === "execucao"));
  const testes = itens.filter((p) => norm(p.state) === "teste aceite usuario");
  const totalEffort = orcamento.reduce((n, p) => n + (p.effort ?? 0), 0);
  const obs = (p: PbiGestaoCliente) => {
    const c = d.comentarios[p.id];
    return c?.texto ? truncar(t(c.texto), 260) : "—";
  };
  const pbi = (p: PbiGestaoCliente): Cel => ({ t: String(p.id), href: linkPbi(p) });
  const dataGeracao = d.geradoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const horaGeracao = d.geradoEm.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  const infoLinhas: [string, string][] = [
    ["Cliente", t(d.cliente)],
    ["Posição em", `${dataGeracao} às ${horaGeracao}`],
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

        {/* 1 e 2 — lado a lado (30 x 70): distribuição por status e demandas aguardando aceite comercial */}
        <Pagina1Bloco itens={itens} orcamento={orcamento} totalEffort={totalEffort} pbi={pbi} bloqueio={d.bloqueio} />

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
                  { titulo: "Chamado", peso: 10 },
                  { titulo: "Tarefa", peso: 28, linhas: 2 },
                  { titulo: "PBI", peso: 7 },
                  { titulo: "PO", peso: 14, linhas: 2 },
                  { titulo: "Abertura produto", peso: 11 },
                  { titulo: "Etapa", peso: 11 },
                  { titulo: "Data comitê", peso: 9 },
                  { titulo: "Agging aberto", peso: 10, direita: true },
                ]}
                linhas={backlog.map((p) => {
                  const aging = agingDiasPbi(p, agora);
                  return [t(p.idExterno) || "—", t(p.titulo), pbi(p), t(p.po) || "—", dataCurta(p.dataAberturaProduto), t(p.etapa) || "—", dataCurta(p.dataComite), { t: aging == null ? "—" : `${aging} d`, bold: true }];
                })}
                vazio="Nenhuma demanda em backlog para os filtros atuais."
              />
            </View>
          </View>
        </Secao>

        {/* 4 e 5 — execução e testes do usuário (tabelas, sem gráficos) */}
        <Secao n={4} titulo="Demandas em execução">
          <TabelaPorStatus itens={execucao} vazio="Nenhuma demanda em execução para os filtros atuais." pbi={pbi} />
        </Secao>
        <Secao n={5} titulo="Demandas em testes do usuário">
          <TabelaPorStatus itens={testes} vazio="Nenhuma demanda em testes do usuário para os filtros atuais." pbi={pbi} />
        </Secao>

        {/* 6 — demandas entregues (visão principal do documento) */}
        <Secao n={6} titulo="Demandas entregues" quebra>
          <DemandasEntregues e={d.entregas} aviso={d.avisoEntregas} hoje={chaveDia(d.geradoEm)} />
        </Secao>

        {/* 7 — listagem completa: sempre no fim do documento */}
        <Secao n={7} titulo="Listagem de demandas" quebra>
          <Text style={{ ...S.legenda, marginBottom: 6 }}>{plural(itens.length, "demanda", "demandas")} na visão, na ordem do fluxo da esteira (status e etapa).</Text>
          <Tabela
            colunas={[
              { titulo: "Chamado", peso: 7 },
              { titulo: "Tarefa", peso: 22, linhas: 2 },
              { titulo: "PBI", peso: 5.5 },
              { titulo: "Status no board", peso: 10 },
              { titulo: "Abertura produto", peso: 8 },
              { titulo: "Etapa", peso: 10 },
              { titulo: "PO", peso: 9, linhas: 2 },
              { titulo: "Classificação", peso: 10.5 },
              { titulo: "Observação", peso: 22, linhas: 3 },
            ]}
            linhas={itens.map((p) => [
              t(p.idExterno) || "—",
              t(p.titulo),
              pbi(p),
              { t: t(p.state), status: p.state },
              dataCurta(p.dataAberturaProduto),
              t(p.etapa) || "—",
              t(p.po) || "—",
              t(p.classificacao) || "—",
              obs(p),
            ])}
            vazio="Nenhuma demanda para os filtros atuais."
          />
        </Secao>
      </Page>
    </Document>
  );
}

function TabelaPorStatus({
  itens,
  vazio,
  pbi,
}: {
  itens: PbiGestaoCliente[];
  vazio: string;
  pbi: (p: PbiGestaoCliente) => Cel;
}) {
  return (
    <View>
      <Text style={{ ...S.legenda, marginBottom: 5, textAlign: "right" }}>{plural(itens.length, "demanda", "demandas")}</Text>
      <Tabela
        colunas={[
          { titulo: "Chamado", peso: 8 },
          { titulo: "PBI", peso: 6 },
          { titulo: "Título", peso: 40, linhas: 2 },
          { titulo: "Etapa", peso: 16 },
          { titulo: "PO", peso: 15, linhas: 2 },
          { titulo: "Classificação", peso: 15 },
        ]}
        linhas={itens.map((p) => [t(p.idExterno) || "—", pbi(p), t(p.titulo), t(p.etapa) || "—", t(p.po) || "—", t(p.classificacao) || "—"])}
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

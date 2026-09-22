import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11 },
  titulo: { fontSize: 18, marginBottom: 12, fontWeight: 700 },
  linha: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  secao: { marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: 700 },
});

// TODO(Heder): trocar por um layout fiel ao template OPR real (branding KMM, Barlow, laranja FF3D03)
// quando tivermos o modelo de referência — este é um placeholder funcional.
function OprDocument({ indicadores, geradoEm }: { indicadores: any[]; geradoEm: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.titulo}>OPR — Produto (KMM4/KMM5)</Text>
        <Text>Gerado em: {new Date(geradoEm).toLocaleString("pt-BR")}</Text>
        {indicadores.map((ind) => (
          <View key={ind.produto} style={{ marginTop: 16 }}>
            <Text style={styles.secao}>{ind.produto}</Text>
            <View style={styles.linha}>
              <Text>Backlog ativo</Text>
              <Text>{ind.backlogAtivo}</Text>
            </View>
            <View style={styles.linha}>
              <Text>Aging médio (dias)</Text>
              <Text>{ind.aging.media}</Text>
            </View>
            <View style={styles.linha}>
              <Text>Aging máximo (dias)</Text>
              <Text>{ind.aging.maximo}</Text>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const indicadoresRes = await fetch(`${origin}/api/indicadores`, { cache: "no-store" });
  const { indicadores, geradoEm } = await indicadoresRes.json();

  const pdfBuffer = await renderToBuffer(OprDocument({ indicadores, geradoEm }) as any);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="opr-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}

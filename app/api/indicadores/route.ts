import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getBacklogAtivo } from "@/lib/devops-client";
import { getServiceClient } from "@/lib/supabase";
import { DEVOPS_PROJETOS, type Produto } from "@/lib/devops-projetos";

function calcularAging(items: { fields: Record<string, unknown> }[]) {
  const agora = Date.now();
  const agings = items.map((item) => {
    const criadoEm = item.fields["System.CreatedDate"] as string | undefined;
    if (!criadoEm) return 0;
    return Math.floor((agora - new Date(criadoEm).getTime()) / (1000 * 60 * 60 * 24));
  });
  const media = agings.length ? agings.reduce((a, b) => a + b, 0) / agings.length : 0;
  return { media: Math.round(media), maximo: Math.max(0, ...agings), total: items.length };
}

export async function GET(request: NextRequest) {
  const produto = request.nextUrl.searchParams.get("produto")?.toUpperCase();

  if (produto && !DEVOPS_PROJETOS[produto as Produto]) {
    return NextResponse.json({ erro: "Produto inválido. Use KMM4 ou KMM5." }, { status: 400 });
  }

  const produtos = (produto ? [produto] : Object.keys(DEVOPS_PROJETOS)) as Produto[];

  const resultado = await Promise.all(
    produtos.map(async (p) => {
      const { project, areaPaths } = DEVOPS_PROJETOS[p];
      const items = await getBacklogAtivo(project, areaPaths);
      const aging = calcularAging(items);
      return { produto: p, backlogAtivo: items.length, aging };
    })
  );

  return NextResponse.json({ indicadores: resultado, geradoEm: new Date().toISOString() });
}

/** Tira uma "foto" dos indicadores atuais e salva como snapshot histórico. */
export async function POST(request: NextRequest) {
  const body = await GET(request);
  const payload = await body.json();

  const supabase = getServiceClient();
  const inserts = payload.indicadores.map((i: { produto: string; backlogAtivo: number; aging: unknown }) => ({
    id: randomUUID(),
    produto: i.produto,
    metricas: { backlogAtivo: i.backlogAtivo, aging: i.aging },
  }));

  const { error } = await supabase.from("IndicadorSnapshot").insert(inserts);
  if (error) {
    return NextResponse.json({ erro: "Falha ao salvar snapshot", detalhe: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snapshotsSalvos: inserts.length });
}

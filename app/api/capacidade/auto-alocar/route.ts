import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ItemAutoAlocacao = { nome: string; sprint: string; squad: string };

/**
 * Bootstrap do board de capacidade a partir do Azure DevOps (pedido por Heder em 2026-09-29,
 * "Sprint inicial" da tela "Planejar capacidade"): recebe os trios (dev, sprint, squad) já
 * calculados no frontend — a partir de Task/Bug reais de KMM5 (ver
 * lib/capacidade.ts::agruparAlocacoesPorDevSprint, que decide a squad mais frequente por dev+
 * sprint quando o dev tem itens em mais de uma) — e faz o upsert em DevCapacidade/
 * AlocacaoCapacidade.
 *
 * `ignoreDuplicates: true` nos dois upserts: uma alocação/dev já existente (seja porque uma
 * captura anterior já criou, seja porque o Heder já mexeu manualmente arrastando no board) NUNCA
 * é sobrescrita por este endpoint — só preenche o que ainda está vazio. Rodar de novo com a mesma
 * sprint inicial não desfaz ajustes manuais.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { produto, itens } = body as { produto?: string; itens?: ItemAutoAlocacao[] };

  if (!produto || !Array.isArray(itens)) {
    return NextResponse.json({ erro: "produto e itens[] são obrigatórios." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const nomes = [...new Set(itens.map((i) => i.nome))];
  if (!nomes.length) {
    return NextResponse.json({ ok: true, devsCriados: 0, alocacoesCriadas: 0 });
  }

  // "id" e "atualizadoEm" gerados aqui, não pelo banco: @default(uuid())/@updatedAt do Prisma só
  // existem pro Prisma Client, e toda escrita em runtime passa pelo client do Supabase (mesmo bug
  // sistêmico já documentado em lib/job-captura.ts — sem isso, o insert falha com "null value in
  // column").
  const agora = new Date().toISOString();
  const { error: erroUpsertDevs } = await supabase
    .from("DevCapacidade")
    .upsert(
      nomes.map((nome) => ({ id: randomUUID(), produto, nome, atualizadoEm: agora })),
      { onConflict: "produto,nome", ignoreDuplicates: true }
    );
  if (erroUpsertDevs) {
    return NextResponse.json({ erro: erroUpsertDevs.message }, { status: 500 });
  }

  const { data: devs, error: erroSelectDevs } = await supabase
    .from("DevCapacidade")
    .select("id, nome")
    .eq("produto", produto)
    .in("nome", nomes);
  if (erroSelectDevs) {
    return NextResponse.json({ erro: erroSelectDevs.message }, { status: 500 });
  }
  const idPorNome = new Map((devs ?? []).map((d) => [d.nome, d.id]));

  const linhasAlocacao = itens
    .map((i) => ({ id: randomUUID(), devId: idPorNome.get(i.nome) as string | undefined, produto, sprint: i.sprint, squad: i.squad }))
    .filter((l): l is typeof l & { devId: string } => Boolean(l.devId));

  const { error: erroUpsertAlocacoes } = await supabase
    .from("AlocacaoCapacidade")
    .upsert(linhasAlocacao, { onConflict: "devId,sprint", ignoreDuplicates: true });
  if (erroUpsertAlocacoes) {
    return NextResponse.json({ erro: erroUpsertAlocacoes.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, devsProcessados: nomes.length, alocacoesProcessadas: linhasAlocacao.length });
}

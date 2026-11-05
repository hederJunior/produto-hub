import { NextRequest, NextResponse } from "next/server";
import { getEntregasCliente } from "@/lib/devops-client";
import type { Produto } from "@/lib/devops-projetos";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Gestão de clientes > "Demandas entregues" (pedido por Heder em 2026-11-04): últimos lançamentos
 * de versão e últimas demandas finalizadas do cliente (regras em lib/entregas-cliente.ts).
 * `cliente` vazio = PBIs sem cliente preenchido. "AMBOS" consulta KMM4 e KMM5.
 */
export async function GET(request: NextRequest) {
  const cliente = request.nextUrl.searchParams.get("cliente");
  if (cliente == null) {
    return NextResponse.json({ erro: "Informe o cliente.", lancamentos: [], finalizadas: [] }, { status: 400 });
  }
  const param = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const produtos: Produto[] = param === "KMM4" || param === "KMM5" ? [param] : ["KMM4", "KMM5"];

  try {
    const entregas = await getEntregasCliente(produtos, cliente);
    return NextResponse.json(entregas, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[clientes/entregas] falha ao buscar as entregas no Azure DevOps:", err);
    const detalhe = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ erro: "Não foi possível carregar as demandas entregues.", detalhe, lancamentos: [], finalizadas: [] }, { status: 502 });
  }
}

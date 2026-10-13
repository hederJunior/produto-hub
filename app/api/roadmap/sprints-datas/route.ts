import { NextRequest, NextResponse } from "next/server";
import { getDatasSprints, type SprintComDatas } from "@/lib/devops-client";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";

/**
 * Datas de início/fim das sprints (Iterations), pro cabeçalho do panel "Alocação por sprint"
 * (pedido por Heder em 2026-10-13). Mesmo padrão de produto das outras rotas do roadmap:
 * "AMBOS" lê KMM4 e KMM5. Se um projeto falhar, devolve o que conseguiu — as datas são só
 * enfeite de cabeçalho, nunca devem impedir o panel de abrir.
 */
export async function GET(request: NextRequest) {
  const produtoParam = request.nextUrl.searchParams.get("produto")?.toUpperCase() ?? "AMBOS";
  const projetos = produtoParam === "AMBOS" ? ["KMM4", "KMM5"] : [produtoParam];

  const resultados = await Promise.allSettled(projetos.map((p) => getDatasSprints(p)));
  const porNome = new Map<string, SprintComDatas>();
  const erros: string[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") {
      // Mesmo nome nos dois projetos: fica o primeiro encontrado (a sprint 8.x é a mesma cadência).
      r.value.forEach((s) => {
        if (!porNome.has(s.nome)) porNome.set(s.nome, s);
      });
    } else {
      console.error(`[roadmap/sprints-datas] falha em ${projetos[i]}:`, r.reason);
      erros.push(`${projetos[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });

  return NextResponse.json({ sprints: Array.from(porNome.values()), ...(erros.length ? { erros } : {}) });
}

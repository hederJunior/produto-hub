import { NextResponse } from "next/server";
import { lerBloqueados } from "@/lib/bloqueio-clientes-servidor";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";

/**
 * Clientes "Bloqueados para novas demandas" segundo a última verificação diária (JOB "bloqueio-clientes"). Usado pela
 * Gestão de clientes, pelo Fluxo do PO (faixa e detalhe do card) e pelo PDF da OPR. Leitura só do que está guardado:
 * não consulta o Azure. Se a tabela ainda não existe, responde `indisponivel: true` e as telas seguem sem o aviso.
 */
export async function GET() {
  return NextResponse.json(await lerBloqueados());
}

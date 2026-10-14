import { NextRequest, NextResponse } from "next/server";
import { getPbisAguardandoPriorizacao } from "@/lib/devops-client";
import { ehAdmin } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * PBIs em "Aguardando Priorização" de uma squad (Area Path), com suas Tasks/Bugs filhas — alimenta o
 * modal "Alocar" do Planejamento de capacidade. Restrito a admin (mesma regra da gravação).
 */
export async function GET(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const squad = request.nextUrl.searchParams.get("squad");
  if (!squad) {
    return NextResponse.json({ erro: "squad é obrigatório." }, { status: 400 });
  }
  try {
    const pbis = await getPbisAguardandoPriorizacao(squad);
    return NextResponse.json({ pbis }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[capacidade/pbis-priorizacao] falha:", err);
    const detalhe = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ erro: "Não foi possível carregar os PBIs do Azure DevOps.", detalhe }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

/**
 * Quem sou eu (e-mail + tipo de acesso), pra a UI decidir o que mostrar — hoje só a seção
 * Administração (tipo = "adm"), que fica escondida da navegação pra usuários comuns. A checagem
 * de verdade (defesa em profundidade) fica nas próprias rotas/telas de admin, não só aqui.
 */
export async function GET() {
  const usuario = await getUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ email: null, tipo: null }, { status: 401 });
  }
  return NextResponse.json(usuario);
}

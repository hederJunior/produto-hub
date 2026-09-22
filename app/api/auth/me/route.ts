import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";

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

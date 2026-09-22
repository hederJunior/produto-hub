import { NextRequest, NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth-allowlist";
import { getRouteClient } from "@/lib/supabase-server";

/**
 * Autenticação fase 1: link mágico (passwordless) via Supabase Auth, liberado apenas
 * para e-mails presentes na tabela AllowedUser. Não existe cadastro de senha — mais simples
 * de operar para um app interno, e o allowlist é o único portão de entrada.
 *
 * A resposta é sempre a mesma, exista ou não o e-mail na allowlist, para não dar pistas
 * de quem tem acesso a quem tentar adivinhar e-mails.
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ erro: "Informe um e-mail." }, { status: 400 });
  }

  const permitido = await isEmailAllowed(email);
  if (permitido) {
    const supabase = getRouteClient();
    const origin = request.nextUrl.origin;
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
  }

  return NextResponse.json({
    ok: true,
    mensagem: "Se esse e-mail estiver liberado, você vai receber um link de acesso em instantes.",
  });
}

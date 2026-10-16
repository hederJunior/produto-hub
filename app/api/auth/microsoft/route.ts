import { NextRequest, NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Login corporativo com Microsoft (Entra ID) via Supabase Auth (provider "azure").
 *
 * Fluxo PKCE iniciado no servidor: o Supabase gera a URL de autorização da Microsoft e grava o
 * code_verifier em cookie (Route Handler pode escrever cookie); a Microsoft devolve pro Supabase
 * (/auth/v1/callback) e ele redireciona pra /auth/callback?code=... — onde a allowlist é conferida.
 *
 * Sem e-mail, sem SMTP, sem link de uso único: não sofre com scanner de e-mail (otp_expired).
 * Se o provider ainda não estiver configurado no Supabase, volta pro /login com aviso — o login
 * por e-mail continua funcionando como fallback.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const supabase = getRouteClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: "email", // exigido pelo Supabase pro provider Azure devolver o e-mail do usuário
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    console.error("[auth/microsoft] signInWithOAuth falhou:", error);
    return NextResponse.redirect(`${origin}/login?erro=microsoft_indisponivel`);
  }
  return NextResponse.redirect(data.url);
}

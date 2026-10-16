import { NextRequest, NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase-server";
import { isEmailAllowed } from "@/lib/auth-allowlist";

export const dynamic = "force-dynamic";

/**
 * Destino do login por Microsoft (OAuth/PKCE) e do link de e-mail (fallback).
 *
 * Allowlist: o middleware só exige sessão, e com login Microsoft QUALQUER pessoa do tenant
 * consegue sessão — então a checagem de AllowedUser é feita aqui, logo após trocar o code.
 * Se o e-mail não está liberado, a sessão recém-criada é encerrada e volta pro /login.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const aoLogin = (erro: string) => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?erro=${erro}`;
    return NextResponse.redirect(url);
  };

  if (params.get("error")) {
    console.error(`[auth/callback] erro do provedor: ${params.get("error")} — ${params.get("error_description")}`);
    return aoLogin("oauth");
  }

  const code = params.get("code");
  if (code) {
    const supabase = getRouteClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data?.user) {
      console.error("[auth/callback] exchangeCodeForSession falhou:", error);
      return aoLogin("sessao");
    }

    const email = data.user.email;
    if (!email || !(await isEmailAllowed(email))) {
      console.warn(`[auth/callback] e-mail fora da allowlist: ${email ?? "(sem e-mail)"}`);
      await supabase.auth.signOut();
      return aoLogin("nao_liberado");
    }
  }

  const destino = request.nextUrl.clone();
  destino.pathname = "/";
  destino.search = "";
  return NextResponse.redirect(destino);
}

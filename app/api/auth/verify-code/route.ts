import { NextRequest, NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth-allowlist";
import { getRouteClient } from "@/lib/supabase-server";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em request-link/route.ts).
export const dynamic = "force-dynamic";

/**
 * Passo 2 do login por código (2026-10-15): valida o código de 6 dígitos que o Supabase enviou por
 * e-mail (`verifyOtp`, type "email") e, se estiver certo, grava a sessão nos cookies — o mesmo
 * cookie que o middleware já lê. Não depende de redirect nem de link, então não é afetado por
 * scanners de e-mail que "abrem" links antes do usuário.
 *
 * Confere a allowlist de novo aqui (defesa em profundidade: um e-mail removido da AllowedUser
 * depois de receber o código não deve conseguir entrar). A resposta de erro é sempre a mesma
 * (código inválido/expirado), sem dizer se foi o código ou o e-mail que falhou. O limite de
 * tentativas por IP/e-mail é do próprio Supabase Auth (rate limit de verificação).
 */
export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => ({}))) as { email?: unknown; token?: unknown };
  const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
  const token = typeof corpo.token === "string" ? corpo.token.replace(/\s+/g, "") : "";

  if (!email || !/^\d{6,8}$/.test(token)) {
    return NextResponse.json({ erro: "Informe o código de 6 dígitos enviado por e-mail." }, { status: 400 });
  }

  const permitido = await isEmailAllowed(email);
  console.log(`[auth/verify-code] e-mail=${email} permitido=${permitido}`);
  if (!permitido) {
    return NextResponse.json({ erro: "Código inválido ou expirado." }, { status: 401 });
  }

  const supabase = getRouteClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    console.error(`[auth/verify-code] verifyOtp falhou para ${email}:`, error.message);
    return NextResponse.json({ erro: "Código inválido ou expirado." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}

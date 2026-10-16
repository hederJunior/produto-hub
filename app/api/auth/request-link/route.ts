import { NextRequest, NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth-allowlist";
import { getRouteClient } from "@/lib/supabase-server";

// Nunca prerenderizar/cachear estaticamente: toda rota aqui lê estado dinâmico
// (Supabase, sessão, Azure DevOps). Sem isso, o Next.js tenta gerar como página estática
// no build qualquer rota GET que não use request/cookies/headers diretamente — e o build
// quebra com erros tipo "supabaseUrl is required." (achado em 2026-09-21 nas rotas
// /api/demandas/filtro e /api/painel-state, as únicas 2 sem esse marcador na época).
export const dynamic = "force-dynamic";

/**
 * Autenticação fase 1: login sem senha por CÓDIGO enviado por e-mail (Supabase Auth, OTP),
 * liberado apenas para e-mails presentes na tabela AllowedUser. Não existe cadastro de senha —
 * mais simples de operar para um app interno, e o allowlist é o único portão de entrada.
 *
 * Mudou de link mágico para código em 2026-10-15: scanners de e-mail corporativo (ex.: Microsoft
 * Defender / Safe Links) abrem o link antes do usuário e, como ele só funciona uma vez, o clique
 * real caía em `otp_expired` ("Email link is invalid or has expired" — caso da Fabiana). Código
 * digitado na tela não é "aberto" por scanner. O e-mail enviado pelo Supabase precisa conter só
 * `{{ .Token }}` e NÃO `{{ .ConfirmationURL }}` (o link consome o mesmo token do código — ver
 * docs/decisoes-e-conhecimento.md). A validação do código está em app/api/auth/verify-code.
 *
 * A resposta é sempre a mesma, exista ou não o e-mail na allowlist, para não dar pistas
 * de quem tem acesso a quem tentar adivinhar e-mails. Os detalhes reais (permitido? o Supabase
 * Auth aceitou o pedido?) só vão pro log de servidor (Vercel Runtime Logs), nunca pra resposta.
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ erro: "Informe um e-mail." }, { status: 400 });
  }

  const permitido = await isEmailAllowed(email);
  console.log(`[auth/request-link] e-mail=${email} permitido=${permitido}`);

  if (permitido) {
    const supabase = getRouteClient();
    // MODO HÍBRIDO (2026-10-16): o e-mail pode trazer o CÓDIGO ({{ .Token }}, quando o template do
    // Supabase foi editado — exige SMTP próprio) ou só o LINK (template padrão do Supabase). Por
    // isso o emailRedirectTo continua aqui: com o template padrão (só link), o link ainda precisa
    // cair em /auth/callback; sem isso o login quebra até o SMTP/template ser configurado.
    const origin = request.nextUrl.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) {
      // Não propaga pro cliente (mantém a resposta genérica por design), mas fica registrado
      // pro Runtime Log da Vercel — achado em 2026-09-22: sem isso, uma falha no envio do
      // Supabase Auth (rate limit, SMTP não configurado, etc.) passava batido em silêncio.
      console.error(`[auth/request-link] signInWithOtp falhou para ${email}:`, error);
    }
  }

  return NextResponse.json({
    ok: true,
    mensagem: "Se esse e-mail estiver liberado, você vai receber um e-mail de acesso em instantes.",
  });
}

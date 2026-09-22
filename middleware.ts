import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Rotas públicas: tela de login, callback do magic link e assets. Tudo mais exige sessão válida.
const PUBLIC_PATHS = ["/login", "/api/auth", "/auth"];

// Rotas de JOB/cron que fazem sua própria autenticação via CRON_SECRET (chamadas pelo Vercel
// Cron, sem sessão de usuário). Achado em 2026-09-19: sem esta exceção, o middleware redireciona
// a chamada do Cron para /login ANTES de ela chegar na checagem de CRON_SECRET da própria rota —
// ou seja, o cron de app/api/alerts/check nunca rodava de fato. Só o método GET (o que o Vercel
// Cron usa) pula a sessão aqui; POST nessas mesmas rotas (ex.: botão "Executar agora" na UI de
// controle do JOB) continua exigindo sessão válida normalmente.
const CRON_GET_PATHS = ["/api/alerts/check", "/api/jobs/captura"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (request.method === "GET" && CRON_GET_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) =>
          response.cookies.set(name, value, options),
        remove: (name: string, options: CookieOptions) =>
          response.cookies.set(name, "", { ...options, maxAge: 0 }),
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Nota: a checagem fina de allowlist (tabela AllowedUser) é feita nas API routes
  // via lib/auth-allowlist.ts, para não duplicar a mesma query em todo request de asset.
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

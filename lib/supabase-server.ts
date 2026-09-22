import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente Supabase pra ler a sessão via next/headers — usado tanto em Route Handlers
 * (app/api/**\/route.ts, onde escrever cookie funciona normalmente) quanto em Server Components
 * (ex.: app/(app)/admin/layout.tsx, via lib/auth-server.ts), onde escrever cookie NÃO é permitido
 * pelo Next.js fora de Server Action/Route Handler.
 *
 * BUG encontrado em 2026-09-20: usar isso dentro do layout de /admin quebrava a tela inteira
 * (erro 500) porque o @supabase/ssr tenta re-gravar/rotacionar o cookie de sessão ao chamar
 * `auth.getUser()`, e `cookieStore.set(...)` sem try/catch estoura "Cookies can only be modified
 * in a Server Action or Route Handler" quando chamado de um Server Component comum. O middleware
 * já cuida de renovar a sessão a cada request, então esse set/remove aqui é best-effort — seguindo
 * a própria recomendação do Supabase pra Next.js App Router, os dois viram no-op silencioso em
 * vez de propagar a exceção.
 */
export function getRouteClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: any) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Chamado de um Server Component (não um Route Handler/Server Action) — sem permissão
            // pra escrever cookie aqui, e sem problema: o middleware já mantém a sessão renovada.
          }
        },
        remove: (name: string, options: any) => {
          try {
            cookieStore.set(name, "", { ...options, maxAge: 0 });
          } catch {
            // Mesmo caso do set acima.
          }
        },
      },
    }
  );
}

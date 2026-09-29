import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Cliente para uso no browser (respeita RLS, sessão do usuário logado). */
export function getBrowserClient() {
  return createClient(url, anonKey);
}

/**
 * Cliente com service role — só usar em código de servidor (API routes, MCP server, cron).
 * Ignora RLS: cuidado ao expor dados via este cliente.
 *
 * `global.fetch` customizado forçando `cache: "no-store"` (achado por Heder em 2026-09-29,
 * depurando o board de "Planejamento de capacidade" ficando vazio só em produção): o Next.js App
 * Router intercepta TODA chamada `fetch` feita durante uma request — inclusive as que o
 * @supabase-js faz por baixo dos panos pra falar com o PostgREST — e por padrão pode cachear
 * chamadas GET com a mesma URL. `export const dynamic = "force-dynamic"` na rota evita cache do
 * PRÓPRIO Next.js pra resposta da rota, mas não necessariamente esse cache interno de fetch pra
 * chamadas de biblioteca de terceiros como o supabase-js. Sintoma batia certinho: uma consulta
 * com filtro (mesma URL sempre, ex. "?produto=eq.KMM5") voltava sempre vazia (cache da 1ª vez,
 * quando a tabela ainda não tinha dados), enquanto consultas sem filtro (URL diferente a cada
 * seleção de colunas) sempre vinham frescas.
 */
export function getServiceClient() {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

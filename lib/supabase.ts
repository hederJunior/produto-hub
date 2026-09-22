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
 */
export function getServiceClient() {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

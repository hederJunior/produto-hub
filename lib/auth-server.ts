import { getRouteClient } from "./supabase-server";
import { getServiceClient } from "./supabase";

export type UsuarioAtual = { email: string; tipo: "adm" | "user" };

/**
 * Usuário logado (via sessão do cookie) + seu tipo (AllowedUser.tipo), pra checagens de
 * autorização em Route Handlers e no layout de /admin. Retorna null se não houver sessão válida
 * ou se o e-mail não estiver (mais) na allowlist — nesse segundo caso o middleware normalmente já
 * teria barrado antes, mas checamos de novo aqui por segurança (defesa em profundidade).
 */
export async function getUsuarioAtual(): Promise<UsuarioAtual | null> {
  const supabaseSessao = getRouteClient();
  const {
    data: { user },
  } = await supabaseSessao.auth.getUser();
  if (!user?.email) return null;

  const supabase = getServiceClient();
  const { data } = await supabase
    .from("AllowedUser")
    .select("tipo")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  if (!data) return null;
  const tipo = data.tipo === "adm" ? "adm" : "user";
  return { email: user.email, tipo };
}

/** Atalho pras rotas de API que só podem ser chamadas por administradores (ex.: gerenciar o JOB). */
export async function ehAdmin(): Promise<boolean> {
  const usuario = await getUsuarioAtual();
  return usuario?.tipo === "adm";
}

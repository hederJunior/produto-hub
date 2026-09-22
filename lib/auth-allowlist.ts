import { getServiceClient } from "./supabase";

/**
 * Fase 1 de autenticação: acesso liberado por e-mail cadastrado na tabela allowed_users.
 * Quando migrar para Azure AD/Entra ID (fase 2), este check pode virar apenas um log/auditoria,
 * já que o próprio tenant do Entra ID passa a restringir quem loga.
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("AllowedUser")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("Erro ao checar allowlist:", error);
    return false;
  }
  return Boolean(data);
}

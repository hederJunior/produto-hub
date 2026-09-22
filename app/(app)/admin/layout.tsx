import { redirect } from "next/navigation";
import { getUsuarioAtual } from "@/lib/auth-server";

/**
 * Guarda de servidor pra toda a seção /admin (Administração, pedido por Heder em 2026-09-20).
 * O middleware já garante sessão válida antes de chegar aqui; este layout adiciona a checagem
 * fina de tipo = "adm" — quem não é admin nunca chega a renderizar nada dentro de /admin/**,
 * mesmo digitando a URL direto (a navegação já esconde o link, mas isso sozinho não impediria
 * o acesso direto por URL).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioAtual();
  if (!usuario || usuario.tipo !== "adm") {
    redirect("/");
  }
  return <>{children}</>;
}

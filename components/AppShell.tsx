"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Map, Bell, ShieldCheck } from "lucide-react";
import { ProdutoProvider, useProduto, type ProdutoSelecionado } from "./ProdutoContext";
import { C, FONTS } from "@/lib/kmm-theme";

const NAV_ITEMS = [
  { href: "/clientes", label: "Gestão de clientes", icon: Users },
  { href: "/roadmap", label: "Roadmap e entregas", icon: Map },
  { href: "/alertas", label: "Alertas e avisos", icon: Bell },
];

// "Administração" (pedido por Heder em 2026-09-20): só aparece pra AllowedUser.tipo = "adm".
// A checagem de verdade fica no servidor (app/(app)/admin/layout.tsx + checagem "ehAdmin" nas
// próprias rotas de API) — esconder o link aqui é só pra não poluir a navegação de quem não usa.
const ADMIN_NAV_ITEM = { href: "/admin", label: "Administração", icon: ShieldCheck };

function useTipoUsuario() {
  const [tipo, setTipo] = useState<"adm" | "user" | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { tipo: null }))
      .then((j) => setTipo(j.tipo ?? null))
      .catch(() => setTipo(null));
  }, []);

  return tipo;
}

function ProdutoSwitcher() {
  const { produto, setProduto } = useProduto();
  const opcoes: { valor: ProdutoSelecionado; label: string }[] = [
    { valor: "KMM4", label: "KMM4" },
    { valor: "KMM5", label: "KMM5" },
    { valor: "AMBOS", label: "Ambos" },
  ];
  return (
    <div className="kmm-seg">
      {opcoes.map((o) => (
        <div
          key={o.valor}
          className={`kmm-seg-item${produto === o.valor ? " active" : ""}`}
          onClick={() => setProduto(o.valor)}
        >
          {o.label}
        </div>
      ))}
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const tipo = useTipoUsuario();

  return (
    <aside style={{ width: 260, borderRight: `1px solid ${C.border}`, background: C.panel, padding: 20, display: "flex", flexDirection: "column", gap: 24 }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        {/* Logo oficial kmm (pedido por Heder em 2026-09-20) — antes era um "kmm" em texto/Sora
            simulando o wordmark; substituído pela arte real fornecida por ele. */}
        <img src="/logo-kmm.png" alt="kmm" style={{ height: 26, width: "auto", display: "block" }} />
        <div>
          <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 700, fontSize: 15, color: C.text }}>Produto Hub</div>
          <div style={{ fontSize: 11, color: C.muted }}>Indicadores, alertas e controles do time de Produto</div>
        </div>
      </Link>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const ativo = pathname === href;
          return (
            <Link key={href} href={href} className={`kmm-nav-item${ativo ? " active" : ""}`}>
              <Icon size={17} />
              {label}
            </Link>
          );
        })}

        {tipo === "adm" && (
          <>
            <div style={{ fontSize: 11, color: C.faint, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", margin: "14px 0 2px 10px" }}>
              Administração
            </div>
            <Link
              href={ADMIN_NAV_ITEM.href}
              className={`kmm-nav-item${pathname.startsWith("/admin") ? " active" : ""}`}
            >
              <ADMIN_NAV_ITEM.icon size={17} />
              {ADMIN_NAV_ITEM.label}
            </Link>
          </>
        )}
      </nav>
    </aside>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="kmm-root" style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "Hanken Grotesk,sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: FONTS }} />
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header style={{ display: "flex", justifyContent: "flex-end", padding: "18px 28px", borderBottom: `1px solid ${C.border}` }}>
          <ProdutoSwitcher />
        </header>
        <main style={{ flex: 1, padding: 28 }}>{children}</main>
      </div>
    </div>
  );
}

/** Layout compartilhado de todas as telas autenticadas (tudo exceto /login). */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ProdutoProvider>
      <ShellInner>{children}</ShellInner>
    </ProdutoProvider>
  );
}

"use client";

import Link from "next/link";
import { RefreshCw, ClipboardEdit, ChevronRight } from "lucide-react";
import { C } from "@/lib/kmm-theme";

const FERRAMENTAS = [
  {
    href: "/admin/job",
    icon: RefreshCw,
    titulo: "JOB de captura",
    descricao: "Liga/desliga a captura automática diária e acompanha o histórico de execuções.",
  },
  {
    href: "/admin/indicadores-manuais",
    icon: ClipboardEdit,
    titulo: "Indicadores manuais",
    descricao: "Lançamento de valores mensais por fora do JOB — histórico retroativo e correções pontuais.",
  },
];

/** Tela inicial da seção Administração (visível só pra AllowedUser.tipo = "adm"). */
export default function AdminPage() {
  return (
    <div>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>Administração</h1>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 20 }}>
        Ferramentas restritas a administradores do Produto Hub.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FERRAMENTAS.map(({ href, icon: Icon, titulo, descricao }) => (
          <Link
            key={href}
            href={href}
            className="kmm-card"
            style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none", cursor: "pointer" }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${C.orange}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={18} color={C.orange} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 14.5 }}>{titulo}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{descricao}</div>
            </div>
            <ChevronRight size={16} color={C.muted} />
          </Link>
        ))}
      </div>
    </div>
  );
}

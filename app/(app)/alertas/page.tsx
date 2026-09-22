"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info, AlertOctagon } from "lucide-react";
import { C } from "@/lib/kmm-theme";

type ItemAviso = {
  titulo: string;
  produto: string;
  origem: string;
  data: string;
  severidade: "CRITICO" | "ATENCAO" | "INFORMATIVO";
};

const SEVERIDADE_UI: Record<ItemAviso["severidade"], { label: string; bg: string; fg: string; icon: any }> = {
  CRITICO: { label: "Crítico", bg: "#FBE7E4", fg: C.red, icon: AlertOctagon },
  ATENCAO: { label: "Atenção", bg: "#FCEFD8", fg: C.amber, icon: AlertTriangle },
  INFORMATIVO: { label: "Informativo", bg: "#E7F5EC", fg: C.green, icon: Info },
};

export default function AlertasPage() {
  const [contagem, setContagem] = useState({ CRITICO: 0, ATENCAO: 0, INFORMATIVO: 0 });
  const [itens, setItens] = useState<ItemAviso[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/avisos", { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => {
        setContagem(j.contagem ?? { CRITICO: 0, ATENCAO: 0, INFORMATIVO: 0 });
        setItens(j.itens ?? []);
      })
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>Alertas e avisos</h1>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 24 }}>O que o time de Produto precisa olhar primeiro nesta semana.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {(["CRITICO", "ATENCAO", "INFORMATIVO"] as const).map((sev) => (
          <div key={sev} className="kmm-card">
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: ".04em" }}>{SEVERIDADE_UI[sev].label.toUpperCase()}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: C.text, marginTop: 6 }}>{contagem[sev]}</div>
          </div>
        ))}
      </div>

      {carregando ? (
        <p style={{ color: C.muted }}>Carregando avisos…</p>
      ) : itens.length === 0 ? (
        <p style={{ color: C.muted }}>Nenhum alerta ou aviso no momento.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {itens.map((item, i) => {
            const ui = SEVERIDADE_UI[item.severidade];
            const Icon = ui.icon;
            return (
              <div key={i} className="kmm-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: ui.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={17} color={ui.fg} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{item.titulo}</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                    <span style={{ color: C.orange, fontWeight: 600 }}>{item.produto}</span> · {item.origem} · {new Date(item.data).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <span className="kmm-chip" style={{ background: ui.bg, color: ui.fg, borderColor: "transparent" }}>{ui.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { Hammer } from "lucide-react";
import { C, PASTEL } from "@/lib/kmm-theme";

/** Aba Downstream do Fluxo do PO: fora da Fase 1 (docs/fluxo-po-decisoes.md §2 e §12), só o aviso. */
export default function FluxoPoDownstream() {
  return (
    <div className="kmm-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px" }}>
      <span
        style={{ width: 40, height: 40, borderRadius: 12, background: PASTEL.amber.bg, color: PASTEL.amber.dot, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
      >
        <Hammer size={20} />
      </span>
      <div>
        <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 600, fontSize: 15, color: C.text }}>Downstream em construção</div>
        <p style={{ margin: "3px 0 0", fontSize: 13, color: C.muted }}>
          O fluxo do Downstream chega em uma fase seguinte. Por enquanto, o Fluxo do PO opera apenas o Upstream.
        </p>
      </div>
    </div>
  );
}

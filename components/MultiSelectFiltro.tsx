"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { C } from "@/lib/kmm-theme";

/**
 * Filtro de seleção múltipla (dropdown com checkboxes; nada marcado = "todos"). Mesmo visual do
 * MultiSelectFiltro do Road Map (app/(app)/roadmap/page.tsx, onde ainda existe uma cópia local) —
 * compartilhado aqui pra Gestão de clientes. `formatar` exibe um rótulo diferente do valor filtrado.
 */
export default function MultiSelectFiltro({
  rotuloTodos,
  opcoes,
  selecionados,
  onChange,
  formatar,
}: {
  rotuloTodos: string;
  opcoes: string[];
  selecionados: string[];
  onChange: (v: string[]) => void;
  formatar?: (v: string) => string;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function alternar(opcao: string) {
    onChange(selecionados.includes(opcao) ? selecionados.filter((s) => s !== opcao) : [...selecionados, opcao]);
  }

  const rotulo =
    selecionados.length === 0
      ? rotuloTodos
      : selecionados.length === 1
        ? formatar?.(selecionados[0]) ?? selecionados[0]
        : `${selecionados.length} selecionados`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="kmm-input"
        onClick={() => setAberto((a) => !a)}
        style={{ width: "auto", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minWidth: 180, cursor: "pointer" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
        <ChevronDown size={14} color={C.muted} style={{ flexShrink: 0 }} />
      </button>
      {aberto && (
        <div
          className="kmm-card"
          style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 240, maxHeight: 280, overflowY: "auto", padding: 8 }}
        >
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}
          >
            <input type="checkbox" checked={selecionados.length === 0} onChange={() => onChange([])} />
            {rotuloTodos}
          </label>
          {opcoes.map((op) => (
            <label key={op} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={selecionados.includes(op)} onChange={() => alternar(op)} />
              {formatar?.(op) ?? op}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

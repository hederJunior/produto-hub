"use client";

import type { ReactNode } from "react";

/**
 * Seletor de VISÃO da página (abas em pílula): trilho cinza-lilás claro e a aba ativa um tom acima.
 * É o mesmo objeto em todas as telas que trocam de seção/visão (Roadmap e entregas, Gestão de
 * clientes...), pra o usuário reconhecer de cara que aquilo troca a visão inteira, e não filtra.
 */
export default function AbasVisao<T extends string>({
  opcoes,
  valor,
  onChange,
  rotulo = "Visão",
}: {
  opcoes: { valor: T; label: string; icone?: ReactNode }[];
  valor: T;
  onChange: (v: T) => void;
  rotulo?: string;
}) {
  return (
    <div role="tablist" aria-label={rotulo} style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 12, background: "#F2F2F6", flexWrap: "wrap" }}>
      {opcoes.map((o) => {
        const ativa = o.valor === valor;
        return (
          <button
            key={o.valor}
            role="tab"
            aria-selected={ativa}
            onClick={() => onChange(o.valor)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: ativa ? 600 : 500,
              padding: "7px 15px",
              borderRadius: 9,
              border: "none",
              cursor: "pointer",
              background: ativa ? "#E6E7EE" : "transparent",
              color: ativa ? "#1E1B18" : "#7A7680",
              transition: "background .15s ease, color .15s ease",
            }}
          >
            {o.icone && <span style={{ display: "flex", color: ativa ? "#FC4C02" : "#9A96A0" }}>{o.icone}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

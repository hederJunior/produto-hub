"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { C } from "@/lib/kmm-theme";

/** Minúsculo e sem acento — "Cotravale" casa "COOTRAVALE", "servicos" casa "Serviços". */
function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Filtro de seleção múltipla (dropdown com checkboxes; nada marcado = "todos"). Mesmo visual do
 * MultiSelectFiltro do Road Map (app/(app)/roadmap/page.tsx, onde ainda existe uma cópia local) —
 * compartilhado aqui pra Gestão de clientes. `formatar` exibe um rótulo diferente do valor filtrado.
 *
 * `pesquisavel` (pedido por Heder em 2026-10-17): mostra uma caixa de texto no topo do dropdown pra
 * digitar e reduzir a lista (ignora maiúsculas e acentos); Enter marca/desmarca quando sobra uma
 * única opção. As opções já marcadas continuam marcadas mesmo escondidas pela busca.
 */
export default function MultiSelectFiltro({
  rotuloTodos,
  opcoes,
  selecionados,
  onChange,
  formatar,
  pesquisavel = false,
  placeholderBusca = "Digite para buscar…",
  unico = false,
}: {
  rotuloTodos: string;
  opcoes: string[];
  selecionados: string[];
  onChange: (v: string[]) => void;
  formatar?: (v: string) => string;
  pesquisavel?: boolean;
  placeholderBusca?: string;
  /**
   * Seleção ÚNICA (pedido por Heder em 2026-10-17, filtro de cliente da Gestão de clientes): sem a
   * opção "todos", escolher uma opção troca a anterior e fecha a lista. `rotuloTodos` vira o texto de
   * "nada escolhido ainda" (ex.: "Selecione um cliente"). `onChange` recebe sempre [opção].
   */
  unico?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  // Fechou: limpa a busca. Abriu: foca a caixa de texto pra já sair digitando.
  useEffect(() => {
    if (!aberto) setBusca("");
    else if (pesquisavel) campoBusca.current?.focus();
  }, [aberto, pesquisavel]);

  function alternar(opcao: string) {
    if (unico) {
      onChange([opcao]);
      setAberto(false);
      return;
    }
    onChange(selecionados.includes(opcao) ? selecionados.filter((s) => s !== opcao) : [...selecionados, opcao]);
  }

  const rotuloDe = (v: string) => formatar?.(v) ?? v;

  const visiveis = useMemo(() => {
    const termo = semAcento(busca);
    return termo ? opcoes.filter((op) => semAcento(rotuloDe(op)).includes(termo)) : opcoes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opcoes, busca]);

  const rotulo =
    selecionados.length === 0
      ? rotuloTodos
      : selecionados.length === 1
        ? rotuloDe(selecionados[0])
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
          style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 260, maxHeight: 340, overflowY: "auto", padding: 8 }}
        >
          {pesquisavel && (
            <div style={{ position: "sticky", top: -8, background: C.panel, margin: "-8px -8px 4px", padding: 8, borderBottom: `1px solid ${C.border}`, zIndex: 1 }}>
              <div style={{ position: "relative" }}>
                <Search size={13} color={C.muted} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  ref={campoBusca}
                  type="text"
                  className="kmm-input"
                  value={busca}
                  placeholder={placeholderBusca}
                  aria-label="Buscar nas opções"
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && visiveis.length === 1) {
                      e.preventDefault();
                      alternar(visiveis[0]);
                    } else if (e.key === "Escape") {
                      setAberto(false);
                    }
                  }}
                  style={{ paddingLeft: 28, fontSize: 13 }}
                />
              </div>
            </div>
          )}
          {!busca && !unico && (
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}
            >
              <input type="checkbox" checked={selecionados.length === 0} onChange={() => onChange([])} />
              {rotuloTodos}
            </label>
          )}
          {visiveis.map((op) => (
            <label key={op} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 13, cursor: "pointer" }}>
              <input type={unico ? "radio" : "checkbox"} checked={selecionados.includes(op)} onChange={() => alternar(op)} />
              {rotuloDe(op)}
            </label>
          ))}
          {busca && visiveis.length === 0 && <div style={{ padding: "8px", fontSize: 12.5, color: C.muted }}>Nenhum resultado para “{busca}”.</div>}
        </div>
      )}
    </div>
  );
}

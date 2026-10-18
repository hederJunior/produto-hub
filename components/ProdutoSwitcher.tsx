"use client";

import { useProduto, type ProdutoSelecionado } from "./ProdutoContext";

/**
 * Seletor global de produto (KMM4 / KMM5 / Ambos). Antes vivia numa barra fixa no topo do
 * AppShell, separada do cabeçalho de cada página; agora é renderizado pelo PageHeader, na mesma
 * linha do título e dos filtros da página (pedido por Heder em 2026-10-10). Em 2026-10-14 foi
 * travado na lateral esquerda (AppShell), fixo e igual em qualquer seção.
 */
export default function ProdutoSwitcher({ cheio = false }: { cheio?: boolean }) {
  const { produto, setProduto } = useProduto();
  const opcoes: { valor: ProdutoSelecionado; label: string }[] = [
    { valor: "KMM4", label: "KMM4" },
    { valor: "KMM5", label: "KMM5" },
    { valor: "AMBOS", label: "Ambos" },
  ];
  return (
    <div className="kmm-seg" style={cheio ? { display: "flex" } : undefined}>
      {opcoes.map((o) => (
        <div
          key={o.valor}
          className={`kmm-seg-item${produto === o.valor ? " active" : ""}`}
          style={cheio ? { flex: 1, textAlign: "center", padding: "8px 6px" } : undefined}
          onClick={() => setProduto(o.valor)}
        >
          {o.label}
        </div>
      ))}
    </div>
  );
}

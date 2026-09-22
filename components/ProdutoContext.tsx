"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type ProdutoSelecionado = "KMM4" | "KMM5" | "AMBOS";

const ProdutoContext = createContext<{
  produto: ProdutoSelecionado;
  setProduto: (p: ProdutoSelecionado) => void;
}>({ produto: "AMBOS", setProduto: () => {} });

export function ProdutoProvider({ children }: { children: ReactNode }) {
  const [produto, setProduto] = useState<ProdutoSelecionado>("AMBOS");
  return <ProdutoContext.Provider value={{ produto, setProduto }}>{children}</ProdutoContext.Provider>;
}

/** Hook para ler/trocar o produto selecionado globalmente (usado no seletor do header e nas telas). */
export function useProduto() {
  return useContext(ProdutoContext);
}

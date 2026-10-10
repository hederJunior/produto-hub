"use client";

import type { ReactNode } from "react";
import { C } from "@/lib/kmm-theme";
import ProdutoSwitcher from "./ProdutoSwitcher";

/**
 * Cabeçalho único de página: título + subtítulo à esquerda; à direita, na MESMA linha (com wrap
 * quando a tela estreita), o seletor global de produto seguido dos filtros/ações da própria
 * página (`children`). Substitui o formato antigo de filtros empilhados (barra global no topo +
 * filtros da página numa linha abaixo + filtros dentro dos cards) — pedido por Heder em
 * 2026-10-10. Nenhum filtro foi removido, só reposicionado.
 *
 * `children` é a ordem visual da direita: o seletor de produto vem primeiro, depois cada filtro.
 * Agrupe controles relacionados num <div style={{display:"flex",gap:8}}> se quiser que quebrem
 * de linha juntos.
 */
export default function PageHeader({
  titulo,
  subtitulo,
  children,
  mostrarProduto = true,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  children?: ReactNode;
  mostrarProduto?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 14,
        marginBottom: 20,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>{titulo}</h1>
        {subtitulo && <p style={{ color: C.muted, marginTop: 4, marginBottom: 0 }}>{subtitulo}</p>}
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginLeft: "auto", justifyContent: "flex-end" }}>
        {mostrarProduto && <ProdutoSwitcher />}
        {children}
      </div>
    </div>
  );
}

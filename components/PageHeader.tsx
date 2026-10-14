"use client";

import type { ReactNode } from "react";
import { C } from "@/lib/kmm-theme";

/**
 * Cabeçalho único de página: título + subtítulo (e, opcionalmente, o seletor de seção `abas`) à
 * esquerda; à direita, na MESMA linha (com wrap quando a tela estreita), os filtros/ações da
 * própria página (`children`). Substitui o formato antigo de filtros empilhados — pedido por Heder
 * em 2026-10-10. O filtro global de produto (KMM4/KMM5/Ambos) NÃO fica mais aqui: foi travado na
 * lateral esquerda (AppShell) em 2026-10-14.
 *
 * Agrupe controles relacionados num <div style={{display:"flex",gap:8}}> se quiser que quebrem
 * de linha juntos.
 */
export default function PageHeader({
  titulo,
  subtitulo,
  abas,
  children,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  /** Seletor de seção da página (ex.: Backlog | Comitê | Sprints | Road Map), abaixo do título. */
  abas?: ReactNode;
  children?: ReactNode;
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
        {abas && <div style={{ marginTop: 16 }}>{abas}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginLeft: "auto", justifyContent: "flex-end" }}>
        {children}
      </div>
    </div>
  );
}

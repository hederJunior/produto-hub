import type { CSSProperties } from "react";

/**
 * Estilo "lista em grupos" (referência enviada por Heder em 2026-11-03) das listas de Upstream:
 * título do grupo colorido, cabeçalho de colunas por grupo e cada linha feita de células brancas
 * soltas, separadas por um vão (fundo da página), com uma barra da cor do grupo na primeira célula.
 */
export const LISTA_CELULA_BG = "#FFFFFF";
export const LISTA_VAO = 4;

/** Título do grupo (texto na cor do grupo, sem fundo). */
export const listaTituloGrupo = (cor: string): CSSProperties => ({
  fontFamily: "Sora,sans-serif",
  fontWeight: 500,
  fontSize: 17,
  color: cor,
  lineHeight: 1.2,
});

/** Cabeçalho de colunas do grupo (texto pequeno cinza, sem fundo). */
export const listaCabecalho: CSSProperties = { padding: "0 10px", fontSize: 11.5, fontWeight: 500, color: "#4B4853" };

/** Container de uma linha em grid: vão entre as células, sem bordas. */
export const listaLinha = (colunas: string): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: colunas,
  columnGap: LISTA_VAO,
  marginBottom: LISTA_VAO,
  alignItems: "stretch",
});

/** Célula branca; a primeira ganha a barra colorida do grupo à esquerda. */
export function listaCelula(opts: { cor: string; primeira?: boolean; centro?: boolean }): CSSProperties {
  return {
    background: LISTA_CELULA_BG,
    borderRadius: 4,
    padding: "10px 10px",
    fontSize: 12.5,
    minHeight: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: opts.centro ? "center" : "flex-start",
    textAlign: opts.centro ? "center" : "left",
    minWidth: 0,
    ...(opts.primeira ? { borderLeft: `6px solid ${opts.cor}` } : {}),
  };
}

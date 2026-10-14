/** Dia (YYYY-MM-DD) de um instante ISO no fuso de Brasília — o mesmo dia exibido no Azure DevOps. */
export function chaveDia(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Dias corridos entre duas chaves de dia (YYYY-MM-DD): `ate − de`. */
export function diasEntreChaves(de: string, ate: string): number {
  const [y1, m1, d1] = de.split("-").map(Number);
  const [y2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "2026-10-14" → "14/10/2026". */
export function formatarChaveDia(chave: string): string {
  return chave.split("-").reverse().join("/");
}

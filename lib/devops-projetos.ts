/**
 * Mapeamento real de projeto + Area Paths do Azure DevOps por produto.
 * Confirmado por Heder em 2026-09-19: KMM4 e KMM5 são dois projetos SEPARADOS na organização
 * (não um projeto único com dois Area Paths, como o código assumia antes). Dentro de cada projeto
 * existem vários times/áreas; os listados abaixo são os que interessam ao Hub.
 */
export type Produto = "KMM4" | "KMM5";

export const DEVOPS_PROJETOS: Record<Produto, { project: string; areaPaths: string[] }> = {
  KMM4: {
    project: "KMM4",
    areaPaths: [
      "KMM4\\TMS - Rangers",
      "KMM4\\TMS - BeeSharp",
      "KMM4\\TMS - Debitos Tecnicos",
      "KMM4\\TMS - Melhorias",
      "KMM4\\TMS - DreamTeam",
      "KMM4\\TMS - Roadmap",
      "KMM4\\TMS - EDI e Fast Track",
    ],
  },
  KMM5: {
    project: "KMM5",
    areaPaths: [
      "KMM5\\TMS - Dedicada Maroni",
      "KMM5\\TMS - Dedicada Transben",
      "KMM5\\TMS - Ecossistema",
      "KMM5\\TMS - Melhorias",
      "KMM5\\TMS - Migracao",
      "KMM5\\TMS - Obrigacoes Legais e Financeiras",
      "KMM5\\TMS - Projetos de Implantacao",
      "KMM5\\TMS - Serviços da Carteira",
    ],
  },
};

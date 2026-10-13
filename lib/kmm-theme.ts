// Paleta e tipografia compartilhadas com components/PainelIndicadores.jsx (mesmos valores),
// para as telas novas (shell, clientes, roadmap, alertas) usarem o mesmo padrão visual do KMM.
// Mantido como um módulo à parte para não mexer no componente já validado.
export const C = {
  bg: "#F4F3F0", panel: "#FFFFFF", border: "#E7E3DC", soft: "#F0EEE9",
  text: "#16130F", muted: "#6E7178", faint: "#A6A39D",
  orange: "#FC4C02", orangeDark: "#E04300", dark: "#201D1A", blue: "#3E7CB1",
  green: "#2E9E5B", amber: "#E8920C", red: "#DD3322", grid: "#ECE9E3",
};

export const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;1,500&display=swap');
.kmm-root *{ box-sizing:border-box; }
.kmm-btn{ font-family:'Hanken Grotesk',sans-serif; font-size:13px; font-weight:600;
  border-radius:9px; padding:9px 15px; cursor:pointer; border:1px solid ${C.border};
  background:#fff; color:${C.text}; transition:all .15s ease; }
.kmm-btn:hover{ border-color:${C.orange}; color:${C.orange}; }
.kmm-btn.primary{ background:${C.orange}; color:#fff; border-color:${C.orange}; }
.kmm-btn.primary:hover{ background:${C.orangeDark}; color:#fff; }
.kmm-card{ background:${C.panel}; border:1px solid ${C.border}; border-radius:14px; padding:16px 18px;
  box-shadow:0 1px 2px rgba(20,16,12,.04), 0 10px 26px rgba(20,16,12,.03); }
.kmm-chip{ display:inline-flex; align-items:center; gap:6px; font-family:'Hanken Grotesk',sans-serif; font-size:12px; font-weight:600;
  padding:5px 10px; border-radius:999px; border:1px solid ${C.border}; background:#fff; color:${C.muted}; }
.kmm-nav-item{ display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:10px; color:${C.muted};
  font-family:'Hanken Grotesk',sans-serif; font-size:14px; font-weight:600; cursor:pointer; text-decoration:none; }
.kmm-nav-item:hover{ background:${C.soft}; color:${C.text}; }
.kmm-nav-item.active{ background:#FFF1EA; color:${C.orange}; }
.kmm-seg{ display:flex; border:1px solid ${C.border}; border-radius:10px; overflow:hidden; background:#fff; }
.kmm-seg-item{ font-family:'Sora',sans-serif; font-size:13px; font-weight:600; padding:8px 16px; cursor:pointer; color:${C.muted}; border-right:1px solid ${C.border}; }
.kmm-seg-item:last-child{ border-right:none; }
.kmm-seg-item.active{ background:${C.soft}; color:${C.text}; }
.kmm-input{ background:#fff; border:1px solid ${C.border}; color:${C.text};
  font-family:'Sora',sans-serif; font-size:14px; border-radius:8px; padding:7px 9px; width:100%; outline:none; }
.kmm-input:focus{ border-color:${C.orange}; box-shadow:0 0 0 3px rgba(252,76,2,.12); }
@keyframes kmm-spin{ from{ transform:rotate(0deg); } to{ transform:rotate(360deg); } }
.kmm-spin{ animation:kmm-spin 0.9s linear infinite; }
`;

/** Mapeia uma situação/severidade para cor de fundo/texto do chip (Ok/Atenção/Vencido/Crítico/Informativo). */
export function corDeStatus(status: string): { bg: string; fg: string } {
  const s = status.toLowerCase();
  if (["ok", "em dia", "no prazo", "informativo"].includes(s)) return { bg: "#E7F5EC", fg: C.green };
  if (["atenção", "atencao", "acompanhar"].includes(s)) return { bg: "#FCEFD8", fg: C.amber };
  if (["vencido", "crítico", "critico", "atrasado"].includes(s)) return { bg: "#FBE7E4", fg: C.red };
  return { bg: C.soft, fg: C.muted };
}

/**
 * Mapeia um State literal do Azure DevOps (PT ou EN — cada squad usa uma convenção diferente,
 * ex.: "Pronto para Testes" numa Task do KMM5, "Done"/"New"/"In Progress" numa Feature) pra cor
 * de status, por palavra-chave (não dá pra confiar numa lista fixa de valores exatos).
 * Usado na tabela de Sprints alocadas (2026-09-23) e pensado pra também servir o Gantt de
 * Features do Roadmap quando esse ajuste de cor por status for feito lá (pedido no F02 - Road Map).
 */
export function corDeEstadoDevOps(state: string): { bg: string; fg: string } {
  if (estadoIndicaConcluido(state)) return { bg: "#E7F5EC", fg: C.green };
  const s = state.toLowerCase();
  if (/andamento|execu|doing|progress|active/.test(s)) return { bg: "#E7F0FA", fg: C.blue };
  if (/teste|review|revis|valida/.test(s)) return { bg: "#FCEFD8", fg: C.amber };
  return { bg: C.soft, fg: C.muted };
}

/** Um State literal do Azure DevOps indica item concluído? (Done/Closed/Concluído/Fechado/...) */
export function estadoIndicaConcluido(state: string): boolean {
  return /conclu|done|closed|fechado|finalizad/i.test(state);
}

/**
 * Paleta fixa pra colorir Epics/Features por AREA (System.AreaPath) no Gantt do Roadmap —
 * pedido no F02 - Road Map ("cada EPIC deve ter uma cor de borda respectiva à sua AREA").
 * `corDaArea()` faz um hash simples e determinístico da string do Area Path pra escolher a cor:
 * a mesma área sempre cai na mesma cor (mesmo com várias áreas simultâneas, sem precisar mapear
 * cada uma manualmente).
 */
export const PALETA_AREA = [
  "#FC4C02", // orange (acento do tema)
  "#3E7CB1", // blue
  "#2E9E5B", // green
  "#8B5CF6", // violet
  "#E8920C", // amber
  "#DD3322", // red
  "#0E9488", // teal
  "#C2185B", // pink
  "#6D4C41", // brown
  "#5C6BC0", // indigo
];

export function corDaArea(areaPath: string): string {
  let hash = 0;
  for (let i = 0; i < areaPath.length; i++) {
    hash = (hash * 31 + areaPath.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PALETA_AREA.length;
  return PALETA_AREA[idx];
}

/**
 * Paleta categórica fixa pra colorir DEV (responsável) no gráfico de "Esforço alocado por
 * Sprint" (painel da aba Sprints, pedido em 2026-09-28) — mesma ideia do hash de `corDaArea`
 * (mesmo dev sempre cai na mesma cor, mesmo trocando o filtro de Area/quantidade de devs no
 * gráfico), mas usando uma ordem de matiz validada pra leitura por pessoas com daltonismo
 * (skill de dataviz: ordem fixa blue/orange/aqua/yellow/magenta/green/violet/red — nunca ciclar
 * hue livremente).
 */
export const PALETA_CATEGORICA_DEV = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

export function corDoDev(nome: string): string {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = (hash * 31 + nome.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PALETA_CATEGORICA_DEV.length;
  return PALETA_CATEGORICA_DEV[idx];
}

/**
 * REGISTRO DE COR POR ÁREA pra exibição em tabela/lista (célula "Área" cheia, texto contrastante)
 * — pedido por Heder em 2026-10-12 na aba Comitês: "cada área deve ter uma cor específica;
 * registrar a cor de cada área pra uso posterior". Fonte única: qualquer tela nova que precise
 * colorir uma Área em formato de tabela deve usar `corDeAreaTabela()` em vez de escolher cor na
 * mão, pra a mesma Área ter sempre a mesma cor em todo o app.
 *
 * Chave = último segmento do Area Path, minúsculo e sem acento (ver `normalizarNomeArea`).
 * Cores saem da paleta do tema (C / PALETA_AREA), não do rascunho Power BI. Área NÃO registrada
 * cai num fallback determinístico (hash da PALETA_AREA, mesma ideia de `corDaArea`) — estável,
 * mas pode repetir cor entre 2 áreas; pra garantir cor própria, é só adicionar a Área aqui.
 */
export const COR_AREA_REGISTRADA: Record<string, string> = {
  "projetos de implantacao": "#3A3632", // grafite quente (do C.dark) — rascunho: cinza escuro
  swat: "#3E7CB1", // C.blue — rascunho: azul
  "dedicada maroni": "#E8920C", // C.amber — rascunho: amarelo
};

/** Último segmento do Area Path, minúsculo e sem acentos (chave do registro de cores). */
export function normalizarNomeArea(areaPath: string): string {
  const ultimo = areaPath.split("\\").pop() || areaPath;
  return ultimo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

/** Texto branco ou escuro conforme a luminância do fundo (WCAG: luminância relativa). */
function corTextoSobre(bgHex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(bgHex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.35 ? C.text : "#FFFFFF";
}

/** Cor de fundo + texto da célula "Área" em tabelas (ver COR_AREA_REGISTRADA). */
export function corDeAreaTabela(areaPath: string): { bg: string; fg: string } {
  const bg = COR_AREA_REGISTRADA[normalizarNomeArea(areaPath)] ?? corDaArea(areaPath);
  return { bg, fg: corTextoSobre(bg) };
}

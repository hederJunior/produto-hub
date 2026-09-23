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
  const s = state.toLowerCase();
  if (/conclu|done|closed|fechado|finalizad/.test(s)) return { bg: "#E7F5EC", fg: C.green };
  if (/andamento|execu|doing|progress|active/.test(s)) return { bg: "#E7F0FA", fg: C.blue };
  if (/teste|review|revis|valida/.test(s)) return { bg: "#FCEFD8", fg: C.amber };
  return { bg: C.soft, fg: C.muted };
}

"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Cell, LabelList,
} from "recharts";

// ---------- paleta NSTech (tema claro) ----------
const C = {
  bg: "#F4F3F0", panel: "#FFFFFF", border: "#E7E3DC", soft: "#F0EEE9",
  text: "#16130F", muted: "#6E7178", faint: "#A6A39D",
  orange: "#FC4C02", orangeDark: "#E04300", dark: "#201D1A", blue: "#3E7CB1",
  green: "#2E9E5B", amber: "#E8920C", red: "#DD3322", grid: "#ECE9E3",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;1,500&display=swap');
.kmm-root *{ box-sizing:border-box; }
.kmm-input{ background:#fff; border:1px solid ${C.border}; color:${C.text}; color-scheme:light;
  font-family:'Sora',sans-serif; font-size:14px; border-radius:8px; padding:7px 9px; width:100%; outline:none; }
.kmm-input:focus{ border-color:${C.orange}; box-shadow:0 0 0 3px rgba(252,76,2,.12); }
.kmm-btn{ font-family:'Hanken Grotesk',sans-serif; font-size:13px; font-weight:600;
  border-radius:9px; padding:9px 15px; cursor:pointer; border:1px solid ${C.border};
  background:#fff; color:${C.text}; transition:all .15s ease; }
.kmm-btn:hover{ border-color:${C.orange}; color:${C.orange}; }
.kmm-btn.primary{ background:${C.orange}; color:#fff; border-color:${C.orange}; }
.kmm-btn.primary:hover{ background:${C.orangeDark}; color:#fff; }
.kmm-btn.sm{ padding:6px 11px; font-size:12px; }
.kmm-tab{ font-family:'Sora',sans-serif; font-size:12.5px; font-weight:600; letter-spacing:.03em;
  padding:10px 15px; cursor:pointer; color:${C.muted}; border-bottom:2.5px solid transparent; transition:all .15s; white-space:nowrap; }
.kmm-tab:hover{ color:${C.text}; }
.kmm-tab.active{ color:${C.orange}; border-bottom-color:${C.orange}; }
.kmm-card{ background:${C.panel}; border:1px solid ${C.border}; border-radius:14px; padding:16px 18px;
  box-shadow:0 1px 2px rgba(20,16,12,.04), 0 10px 26px rgba(20,16,12,.03); }
.kmm-band{ background:${C.orange}; color:#fff; border-radius:10px; padding:9px 16px;
  font-family:'Hanken Grotesk',sans-serif; font-style:italic; font-weight:600; font-size:15px; }
.kmm-chip{ display:inline-flex; align-items:center; gap:6px; font-family:'Hanken Grotesk',sans-serif; font-size:12px; font-weight:600;
  padding:5px 10px; border-radius:999px; border:1px solid ${C.border}; background:#fff; color:${C.muted}; cursor:pointer; transition:all .15s; }
.kmm-chip.on{ border-color:${C.orange}; color:${C.text}; background:#FFF4EE; }
.kmm-range{ -webkit-appearance:none; appearance:none; position:absolute; left:0; top:0; width:100%; height:24px; background:transparent; pointer-events:none; margin:0; }
.kmm-range::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; pointer-events:auto; width:16px; height:16px; border-radius:50%;
  background:${C.orange}; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,.3); cursor:pointer; }
.kmm-range::-moz-range-thumb{ pointer-events:auto; width:16px; height:16px; border-radius:50%; background:${C.orange}; border:2px solid #fff; cursor:pointer; }
.kmm-fade{ animation:kmmfade .45s ease both; }
@keyframes kmmfade{ from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:none;} }
`;

// ---------- categorias e faixas de aging ----------
const AGING_CATS = [
  { key: "viabilidade", label: "Análise de viabilidade" },
  { key: "execucao", label: "Em execução" },
  { key: "teste", label: "Prontas para teste" },
  { key: "comercial", label: "Comercial / CS" },
];
const AGING_BUCKETS = [
  { key: "lt15", label: "Menos que 15 dias", short: "< 15", color: C.green },
  { key: "b1530", label: "Entre 15 e 30 dias", short: "15–30", color: C.amber },
  { key: "b3045", label: "Entre 30 e 45 dias", short: "30–45", color: "#F0651F" },
  { key: "gt45", label: "Mais que 45 dias", short: "> 45", color: C.red },
];
const zeroBuckets = () => ({ lt15: 0, b1530: 0, b3045: 0, gt45: 0 });
const sampleBuckets = (a, b, c, d) => ({ lt15: a, b1530: b, b3045: c, gt45: d });
const blankAging = () => ({ viabilidade: zeroBuckets(), execucao: zeroBuckets(), teste: zeroBuckets(), comercial: zeroBuckets() });
const zeroFluxo = () => ({ abertas: 0, finalizadas: 0, negadas: 0 });

// ---------- estado padrão (valores de EXEMPLO) ----------
const DEFAULT_DATA = {
  kmm4: {
    fluxo: { abertas: 18, finalizadas: 14, negadas: 3 },
    aging: 9,
    backlog: { execucao: 20, delivery: 12 },
    backlogViab: 14,
    leadEdi: 17,
    legado: 19,
    prontas30: 4,
    agingDist: {
      viabilidade: sampleBuckets(12, 8, 5, 3),
      execucao: sampleBuckets(20, 14, 6, 4),
      teste: sampleBuckets(7, 3, 2, 1),
      comercial: sampleBuckets(5, 4, 3, 6),
    },
  },
  kmm5: {
    fluxoCarteira: { abertas: 10, finalizadas: 7, negadas: 2 },
    fluxoDedicada: { abertas: 5, finalizadas: 4, negadas: 1 },
    agingViab: { customizacoes: 105, integracoes: 99 },
    backlog: { execucao: 16, delivery: 8 },
    backlogViab: 11,
    leadEntrega: { integracoes: 121, customizacoes: 105 },
    incidentes: 1,
    prontas30: 3,
    agingDist: {
      viabilidade: sampleBuckets(4, 6, 5, 9),
      execucao: sampleBuckets(8, 7, 4, 3),
      teste: sampleBuckets(3, 2, 1, 2),
      comercial: sampleBuckets(2, 3, 2, 4),
    },
  },
};

const DEFAULT_TH = {
  kmm4: { aging: [7, 15], backlog: [20, 40], backlogViab: [20, 40], leadEdi: [30, 45], legado: [10, 20], prontas30: [2, 5] },
  kmm5: { agingViab: [45, 60], backlog: [20, 40], backlogViab: [20, 40], leadEntrega: [30, 66], incidentes: [0, 1], prontas30: [2, 5] },
};

// indicadores escalares (editor de snapshot + entrada)
const IND_FIELDS = {
  kmm4: [
    { label: "Demandas abertas", path: ["kmm4", "fluxo", "abertas"] },
    { label: "Demandas finalizadas", path: ["kmm4", "fluxo", "finalizadas"] },
    { label: "Demandas negadas/cancel.", path: ["kmm4", "fluxo", "negadas"] },
    { label: "Aging viab. (d)", path: ["kmm4", "aging"] },
    { label: "Backlog viabilidade", path: ["kmm4", "backlogViab"] },
    { label: "Backlog Execução", path: ["kmm4", "backlog", "execucao"] },
    { label: "Backlog Delivery", path: ["kmm4", "backlog", "delivery"] },
    { label: "Lead EDI PROCEDA (d)", path: ["kmm4", "leadEdi"] },
    { label: "% Legado", path: ["kmm4", "legado"] },
    { label: "Prontas >30d", path: ["kmm4", "prontas30"] },
  ],
  kmm5: [
    { label: "Carteira/Proj. abertas", path: ["kmm5", "fluxoCarteira", "abertas"] },
    { label: "Carteira/Proj. finalizadas", path: ["kmm5", "fluxoCarteira", "finalizadas"] },
    { label: "Carteira/Proj. negadas/cancel.", path: ["kmm5", "fluxoCarteira", "negadas"] },
    { label: "Dedicadas abertas", path: ["kmm5", "fluxoDedicada", "abertas"] },
    { label: "Dedicadas finalizadas", path: ["kmm5", "fluxoDedicada", "finalizadas"] },
    { label: "Dedicadas negadas/cancel.", path: ["kmm5", "fluxoDedicada", "negadas"] },
    { label: "Aging Custom. (d)", path: ["kmm5", "agingViab", "customizacoes"] },
    { label: "Aging Integr. (d)", path: ["kmm5", "agingViab", "integracoes"] },
    { label: "Backlog viabilidade", path: ["kmm5", "backlogViab"] },
    { label: "Backlog Execução", path: ["kmm5", "backlog", "execucao"] },
    { label: "Backlog Delivery", path: ["kmm5", "backlog", "delivery"] },
    { label: "Lead Integr. (d)", path: ["kmm5", "leadEntrega", "integracoes"] },
    { label: "Lead Custom. (d)", path: ["kmm5", "leadEntrega", "customizacoes"] },
    { label: "Incidentes", path: ["kmm5", "incidentes"] },
    { label: "Prontas >30d", path: ["kmm5", "prontas30"] },
  ],
};

const STORAGE_KEY = "kmm-backlog-dashboard:v1";

// ---------- helpers ----------
const sum = (o) => Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0);
const num = (v) => (v === "" || v === null || isNaN(Number(v)) ? 0 : Number(v));
const uid = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const deep = (o) => JSON.parse(JSON.stringify(o));
const getPath = (obj, path) => path.reduce((o, k) => (o == null ? o : o[k]), obj);
function setPathClone(obj, path, value) {
  const c = deep(obj); let o = c;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path[path.length - 1]] = value; return c;
}
const tsToInput = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtShort = (ts) => new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtMonth = (ts) => new Date(ts).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
const lastPerMonth = (rows) => {
  const map = new Map();
  rows.forEach((r) => { const d = new Date(r.ts); const k = d.getFullYear() + "-" + d.getMonth(); const p = map.get(k); if (!p || r.ts > p.ts) map.set(k, r); });
  return [...map.values()].sort((a, b) => a.ts - b.ts);
};
const fmtBR = (ts) => new Date(ts).toLocaleDateString("pt-BR");
const inputToTs = (val) => {
  if (!val) return Date.now();
  const [y, m, d] = val.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
};

// migração: leadEdi {proceda,ws}→número; garante agingDist
function migrateData(d) {
  const c = deep(d);
  ["kmm4", "kmm5"].forEach((p) => {
    if (!c[p]) return;
    if (!c[p].agingDist) c[p].agingDist = blankAging();
    AGING_CATS.forEach((cat) => {
      if (!c[p].agingDist[cat.key]) c[p].agingDist[cat.key] = zeroBuckets();
    });
  });
  if (c.kmm4 && !c.kmm4.fluxo) c.kmm4.fluxo = zeroFluxo();
  if (c.kmm5) {
    if (!c.kmm5.fluxoCarteira) c.kmm5.fluxoCarteira = c.kmm5.fluxo ? { ...c.kmm5.fluxo } : zeroFluxo();
    if (!c.kmm5.fluxoDedicada) c.kmm5.fluxoDedicada = zeroFluxo();
    delete c.kmm5.fluxo;
  }
  if (c.kmm4 && c.kmm4.leadEdi && typeof c.kmm4.leadEdi === "object") c.kmm4.leadEdi = num(c.kmm4.leadEdi.proceda);
  ["kmm4", "kmm5"].forEach((p) => {
    if (!c[p]) return;
    const b = c[p].backlog || {};
    if (b.execucao === undefined && b.delivery === undefined) {
      c[p].backlog = { execucao: num(b.analise) + num(b.desenvolvimento), delivery: num(b.homologacao) };
    } else {
      c[p].backlog = { execucao: num(b.execucao), delivery: num(b.delivery) };
    }
  });
  if (c.kmm4 && c.kmm4.backlogViab == null) c.kmm4.backlogViab = 0;
  if (c.kmm5 && c.kmm5.backlogViab == null) c.kmm5.backlogViab = 0;
  return c;
}

// completa thresholds ausentes a partir do padrão (compat com dados antigos)
function ensureTh(t) {
  const c = deep(DEFAULT_TH);
  ["kmm4", "kmm5"].forEach((p) => { if (t && t[p]) Object.keys(t[p]).forEach((k) => { c[p][k] = t[p][k]; }); });
  return c;
}

function statusColor(value, [verde, amarelo]) {
  if (value <= verde) return C.green;
  if (value <= amarelo) return C.amber;
  return C.red;
}
const statusLabel = (c) => (c === C.green ? "OK" : c === C.amber ? "ATENÇÃO" : "CRÍTICO");
function Dot({ color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
      <span style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".06em", color }}>{statusLabel(color)}</span>
    </span>
  );
}

// ---------- CSV ----------
const AGING_CSV = [];
["kmm4", "kmm5"].forEach((p) => AGING_CATS.forEach((cat) => AGING_BUCKETS.forEach((bk) =>
  AGING_CSV.push({ header: `${p.toUpperCase()} Aging ${cat.label} ${bk.short}`, path: [p, "agingDist", cat.key, bk.key] }))));
const CSV_COLS = [
  ...IND_FIELDS.kmm4.map((f) => ({ header: "KMM4 " + f.label, path: f.path })),
  ...IND_FIELDS.kmm5.map((f) => ({ header: "KMM5 " + f.label, path: f.path })),
  ...AGING_CSV,
];
function zeroData() {
  let z = deep(DEFAULT_DATA);
  CSV_COLS.forEach((c) => { z = setPathClone(z, c.path, 0); });
  return z;
}
const parseNumBR = (v) => {
  if (v == null) return 0;
  const t = String(v).trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(t); return isNaN(n) ? 0 : n;
};
function parseDateBR(v) {
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12).getTime();
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 12).getTime();
  const d = Date.parse(t); return isNaN(d) ? Date.now() : d;
}
function parseSnapshotsCSV(raw) {
  const text = String(raw).replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim());
  const colByHeader = {};
  CSV_COLS.forEach((c) => { colByHeader[c.header] = c.path; });
  const dateIdx = headers.findIndex((h) => h.toLowerCase() === "data");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep);
    let d = zeroData();
    headers.forEach((h, idx) => { const path = colByHeader[h]; if (path) d = setPathClone(d, path, parseNumBR(cells[idx])); });
    const ts = dateIdx >= 0 ? parseDateBR(cells[dateIdx]) : Date.now();
    out.push({ id: uid(), ts, data: d });
  }
  return out;
}

// carrega script externo sob demanda (para gerar PDF)
function loadScript(src) {
  return new Promise((res, rej) => {
    window.__oprLoaded = window.__oprLoaded || {};
    if (window.__oprLoaded[src]) return res();
    const sc = document.createElement("script");
    sc.src = src; sc.async = true;
    const to = setTimeout(() => rej(new Error("timeout " + src)), 9000);
    sc.onload = () => { clearTimeout(to); window.__oprLoaded[src] = true; res(); };
    sc.onerror = () => { clearTimeout(to); rej(new Error("falha ao carregar " + src)); };
    document.head.appendChild(sc);
  });
}

// ---------- App ----------
export default function App() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [th, setTh] = useState(DEFAULT_TH);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState("kmm4");
  const [product, setProduct] = useState("kmm4");
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expandedSnap, setExpandedSnap] = useState(null);
  const [range, setRange] = useState(null);
  const [draftDate, setDraftDate] = useState(tsToInput(Date.now()));
  const [resetArm, setResetArm] = useState(false);
  const [oprBusy, setOprBusy] = useState(false);
  const [flashMsg, setFlashMsg] = useState("");

  // Persistência: estado compartilhado por todo o time via /api/painel-state (Postgres/Supabase),
  // em vez do storage do Artifact (que era isolado por navegador/usuário).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/painel-state");
        if (res.ok) {
          const s = await res.json();
          if (s.data) setData(migrateData(s.data));
          if (s.th) setTh(ensureTh(s.th));
          if (s.history) setHistory(s.history.map((h) => ({ id: h.id || uid(), ts: h.ts, data: migrateData(h.data) })));
        }
      } catch (e) { console.error("Falha ao carregar painel-state:", e); }
      finally { setLoaded(true); }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => {
      fetch("/api/painel-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, th, history }),
      }).catch((e) => console.error("Falha ao salvar painel-state:", e));
    }, 600);
    return () => clearTimeout(id);
  }, [data, th, history, loaded]);

  const flash = (m) => { setFlashMsg(m); setTimeout(() => setFlashMsg(""), 2200); };

  const sortedHistory = useMemo(() => [...history].sort((a, b) => a.ts - b.ts), [history]);
  const allRows = useMemo(() => sortedHistory.map((h) => ({ ts: h.ts, t: fmtShort(h.ts), d: h.data })), [sortedHistory]);

  // clamp do período quando o histórico muda
  useEffect(() => {
    if (!sortedHistory.length) { setRange(null); return; }
    const lo = sortedHistory[0].ts, hi = sortedHistory[sortedHistory.length - 1].ts;
    setRange((r) => (!r ? { start: lo, end: hi } : { start: Math.min(Math.max(r.start, lo), hi), end: Math.max(Math.min(r.end, hi), lo) }));
  }, [sortedHistory]);

  const filteredRows = useMemo(() => {
    if (!range) return allRows;
    return allRows.filter((r) => r.ts >= range.start && r.ts <= range.end);
  }, [allRows, range]);

  function takeSnapshot() { setHistory((h) => [...h, { id: uid(), ts: Date.now(), data: deep(data) }]); flash("Snapshot de hoje registrado"); }
  function addSnapshot() { const id = uid(); setHistory((h) => [...h, { id, ts: Date.now(), data: deep(data) }]); setExpandedSnap(id); flash("Snapshot adicionado"); }
  const updateSnapDate = (id, val) => setHistory((h) => h.map((s) => (s.id === id ? { ...s, ts: inputToTs(val) } : s)));
  const updateSnapVal = (id, path, val) => setHistory((h) => h.map((s) => (s.id === id ? { ...s, data: setPathClone(s.data, path, num(val)) } : s)));
  const deleteSnap = (id) => setHistory((h) => h.filter((s) => s.id !== id));
  function resetAll() {
    if (!resetArm) { setResetArm(true); setTimeout(() => setResetArm(false), 3000); return; }
    setResetArm(false); setData(DEFAULT_DATA); setTh(DEFAULT_TH); setHistory([]); flash("Painel reiniciado");
  }

  function registerAtDate() {
    const ts = inputToTs(draftDate); const key = tsToInput(ts);
    setHistory((h) => {
      const idx = h.findIndex((s) => tsToInput(s.ts) === key);
      if (idx >= 0) { const c = [...h]; c[idx] = { ...c[idx], data: deep(data) }; return c; }
      return [...h, { id: uid(), ts, data: deep(data) }];
    });
    flash("Snapshot registrado em " + fmtBR(ts));
  }
  function prefillLatest() {
    if (!sortedHistory.length) { flash("Sem snapshot para copiar"); return; }
    setData(migrateData(sortedHistory[sortedHistory.length - 1].data)); flash("Pré-preenchido com o último snapshot");
  }

  function exportCSV() {
    const sep = ";";
    const head = ["Data", ...CSV_COLS.map((c) => c.header)].join(sep);
    const rows = [...history].sort((a, b) => a.ts - b.ts).map((s) => [tsToInput(s.ts), ...CSV_COLS.map((c) => getPath(s.data, c.path))].join(sep));
    const csv = "\uFEFF" + [head, ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `snapshots-kmm-${tsToInput(Date.now())}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(history.length ? "CSV exportado" : "Modelo CSV exportado");
  }
  function replaceHistory(arr) { setHistory(arr); setExpandedSnap(null); flash(`${arr.length} snapshot(s) importado(s)`); }

  function downloadHTMLReport(wrap) {
    const inner = wrap.innerHTML;
    const html = "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>"
      + "<meta name='viewport' content='width=device-width, initial-scale=1'><title>OPR " + product.toUpperCase() + "</title>"
      + "<style>" + FONTS + "</style>"
      + "<style>body{margin:0;background:#F4F3F0;color:#16130F;font-family:'Hanken Grotesk',sans-serif;}"
      + ".opr-wrap{max-width:440px;margin:0 auto;padding:16px;} @media print{.opr-tip{display:none;}}</style></head>"
      + "<body><div class='opr-wrap'><div class='opr-tip' style='font-size:11px;color:#6E7178;margin-bottom:10px;'>"
      + "Para salvar em PDF: menu do navegador → Imprimir/Compartilhar → Salvar como PDF.</div>"
      + inner + "</div></body></html>";
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "OPR-" + product.toUpperCase() + "-" + tsToInput(Date.now()) + ".html";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function generateOPR() {
    const wrap = document.getElementById("opr-" + product);
    if (!wrap || oprBusy) return;
    setOprBusy(true);
    const prevW = wrap.style.width, prevMax = wrap.style.maxWidth;
    wrap.style.width = "430px"; wrap.style.maxWidth = "430px"; // coluna única (leitura mobile)
    await new Promise((r) => setTimeout(r, 550));
    try {
      await loadScript("https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js");
      await loadScript("https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js");
      const canvas = await window.html2canvas(wrap, { scale: 2, backgroundColor: "#F4F3F0", useCORS: true, logging: false });
      const JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      const pageW = 90, pageH = pageW * (canvas.height / canvas.width);
      const pdf = new JsPDF({ orientation: "portrait", unit: "mm", format: [pageW, pageH], compress: true });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageW, pageH);
      pdf.save("OPR-" + product.toUpperCase() + "-" + tsToInput(Date.now()) + ".pdf");
      flash("OPR (PDF) gerado");
    } catch (e) {
      try { downloadHTMLReport(wrap); flash("Baixado OPR em HTML — abra e use “Salvar como PDF”"); }
      catch (e2) { flash("Não foi possível gerar o OPR neste ambiente"); }
    } finally {
      wrap.style.width = prevW; wrap.style.maxWidth = prevMax;
      setOprBusy(false);
    }
  }

  const setVal = (path, v) => setData((d) => setPathClone(d, path, num(v)));
  const setThVal = (key, idx, v) => setTh((t) => { const c = deep(t); c[product][key][idx] = num(v); return c; });

  if (!loaded) {
    return (
      <div className="kmm-root" style={{ background: C.bg, color: C.muted, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sora',sans-serif" }}>
        <style dangerouslySetInnerHTML={{ __html: FONTS }} />carregando indicadores…
      </div>
    );
  }

  const isProductView = view === "kmm4" || view === "kmm5";
  const showSnapToday = ["kmm4", "kmm5", "aging4", "aging5"].includes(view);
  const bandLabel = product === "kmm4" ? "KMM4 — Backlog & Experiência de Delivery" : "KMM5 — Lead Time & Estabilização de Versão";
  const TABS = [["kmm4", "KMM4"], ["kmm5", "KMM5"], ["aging4", "AGING KMM4"], ["aging5", "AGING KMM5"], ["input", "ENTRADA"], ["snapshots", "SNAPSHOTS"]];

  return (
    <div className="kmm-root" style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "'Hanken Grotesk',sans-serif",
      backgroundImage: `radial-gradient(circle at 92% 6%, #EFEDE7 0%, transparent 26%)` }}>
      <style dangerouslySetInnerHTML={{ __html: FONTS }} />

      <div style={{ background: C.orange, color: "#fff", padding: "22px clamp(16px,4vw,44px) 24px", position: "relative", overflow: "hidden",
        backgroundImage: "radial-gradient(circle at 82% 18%, rgba(255,255,255,.13), transparent 38%), radial-gradient(circle at 97% 90%, rgba(255,255,255,.10), transparent 32%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Mark />
            <div>
              <div style={{ fontStyle: "italic", fontWeight: 600, fontSize: 12, letterSpacing: ".04em", opacity: .92 }}>FUP · Indicadores de Produto</div>
              <h1 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: "clamp(24px,3.4vw,36px)", margin: "2px 0 0", lineHeight: 1, letterSpacing: "-.01em" }}>Painel de Backlog</h1>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 26, lineHeight: 1, letterSpacing: "-.02em" }}>nstech</div>
            <div style={{ fontSize: 9, letterSpacing: ".22em", opacity: .9, marginTop: 3 }}>YOUR LOGISTICS ADVANTAGE</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "20px clamp(16px,4vw,44px) 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div style={{ color: C.muted, fontSize: 13 }}>
            {view === "input" ? "Preencha os valores Atuais e registre como snapshot na data escolhida."
              : view === "snapshots" ? "Gerencie os snapshots — data, valores e CSV."
                : view.startsWith("aging") ? "Distribuição por faixa de idade. Escolha a referência (snapshot ou Atual) no seletor."
                  : editing ? "Editando os valores Atuais e as metas. Salvamento automático."
                    : "Indicador Atual + histórico dos snapshots no período selecionado."}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {flashMsg && <span style={{ fontSize: 12, fontWeight: 600, color: C.green, marginRight: 4 }}>✓ {flashMsg}</span>}
            {isProductView && (editing
              ? <button className="kmm-btn primary" onClick={() => { setEditing(false); flash("Alterações salvas"); }}>Concluir edição</button>
              : <button className="kmm-btn" onClick={() => setEditing(true)}>Editar Atual e metas</button>)}
            {isProductView && <button className="kmm-btn primary" onClick={generateOPR} disabled={oprBusy} style={{ opacity: oprBusy ? 0.7 : 1 }}>{oprBusy ? "Gerando OPR…" : "Gerar OPR"}</button>}
            {showSnapToday && <button className="kmm-btn" onClick={takeSnapshot}>Registrar snapshot (hoje)</button>}
            <button className="kmm-btn" onClick={resetAll} style={{ color: resetArm ? C.red : C.faint, borderColor: resetArm ? C.red : C.border }}>{resetArm ? "Confirmar reset?" : "Reiniciar"}</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 20, overflowX: "auto" }}>
          {TABS.map(([k, lbl]) => (
            <div key={k} className={`kmm-tab ${view === k ? "active" : ""}`}
              onClick={() => { setView(k); if (k === "kmm4" || k === "aging4") setProduct("kmm4"); if (k === "kmm5" || k === "aging5") setProduct("kmm5"); }}>
              {lbl}{k === "snapshots" && history.length > 0 ? ` · ${history.length}` : ""}
            </div>
          ))}
        </div>

        {view === "snapshots" ? (
          <SnapshotManager history={sortedHistory} expandedId={expandedSnap} setExpandedId={setExpandedSnap}
            onAdd={addSnapshot} onDate={updateSnapDate} onVal={updateSnapVal} onDelete={deleteSnap} onExport={exportCSV} onReplace={replaceHistory} onNotify={flash} />
        ) : view === "input" ? (
          <InputTab data={data} setVal={setVal} draftDate={draftDate} setDraftDate={setDraftDate} onRegister={registerAtDate} onPrefill={prefillLatest} hasHistory={sortedHistory.length > 0} />
        ) : view === "aging4" ? (
          <AgingTab product="kmm4" liveData={data} history={sortedHistory} />
        ) : view === "aging5" ? (
          <AgingTab product="kmm5" liveData={data} history={sortedHistory} />
        ) : (
          <div key={product} className="kmm-fade">
            {range && sortedHistory.length >= 1 && (
              <DateRangeFilter minTs={sortedHistory[0].ts} maxTs={sortedHistory[sortedHistory.length - 1].ts}
                start={range.start} end={range.end} count={filteredRows.length}
                onChange={(s, e) => setRange({ start: s, end: e })} />
            )}
            <div id={"opr-" + product}>
              <div className="kmm-band" style={{ marginBottom: 10 }}>{bandLabel}</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
                OPR · gerado em {fmtBR(Date.now())}{range ? ` · período ${fmtShort(range.start)} a ${fmtShort(range.end)}` : ""}
              </div>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
                {product === "kmm4"
                  ? <KMM4 {...{ data, th, editing, setVal, setThVal, rows: filteredRows }} />
                  : <KMM5 {...{ data, th, editing, setVal, setThVal, rows: filteredRows }} />}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, color: C.faint, fontSize: 11 }}>
          Salvamento automático no banco compartilhado do time (Produto Hub). Os valores iniciais são exemplos — substitua pelos reais.
        </div>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg width="30" height="34" viewBox="0 0 30 34" fill="none" aria-hidden="true">
      <rect x="0" y="2" width="10" height="10" rx="1.5" fill="#fff" />
      <path d="M0 16 L10 16 L10 26 Z" fill="#fff" opacity="0.85" />
      <rect x="14" y="3" width="11" height="3.6" rx="1.8" transform="rotate(35 14 3)" fill="#fff" />
      <rect x="13" y="20" width="11" height="3.6" rx="1.8" transform="rotate(-35 13 20)" fill="#fff" opacity="0.85" />
    </svg>
  );
}

// ---------- filtro de período ----------
function DateRangeFilter({ minTs, maxTs, start, end, count, onChange }) {
  const DAY = 86400000;
  const span = Math.max(1, maxTs - minTs);
  const pct = (t) => ((t - minTs) / span) * 100;
  return (
    <div className="kmm-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 13 }}>Período</div>
          <div style={{ fontSize: 11, color: C.muted }}>Filtra todos os gráficos da aba — {count} snapshot(s) no intervalo.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>De
            <input className="kmm-input" type="date" style={{ width: 150 }} value={tsToInput(start)} min={tsToInput(minTs)} max={tsToInput(end)}
              onChange={(e) => onChange(Math.min(inputToTs(e.target.value), end), end)} />
          </label>
          <label style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Até
            <input className="kmm-input" type="date" style={{ width: 150 }} value={tsToInput(end)} min={tsToInput(start)} max={tsToInput(maxTs)}
              onChange={(e) => onChange(start, Math.max(inputToTs(e.target.value), start))} />
          </label>
        </div>
      </div>
      <div style={{ position: "relative", height: 24, marginTop: 16 }}>
        <div style={{ position: "absolute", top: 10, left: 0, right: 0, height: 5, borderRadius: 3, background: C.soft }} />
        <div style={{ position: "absolute", top: 10, height: 5, borderRadius: 3, background: C.orange, left: pct(start) + "%", width: Math.max(0, pct(end) - pct(start)) + "%" }} />
        <input className="kmm-range" type="range" min={minTs} max={maxTs} step={DAY} value={start} onChange={(e) => onChange(Math.min(+e.target.value, end), end)} />
        <input className="kmm-range" type="range" min={minTs} max={maxTs} step={DAY} value={end} onChange={(e) => onChange(start, Math.max(+e.target.value, start))} />
      </div>
    </div>
  );
}

// ---------- charts ----------
function NoData() {
  return <div style={{ height: 132, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 12, textAlign: "center" }}>Sem snapshots no período — registre ou amplie o filtro.</div>;
}
const axisTick = { fill: C.muted, fontSize: 10, fontFamily: "'Hanken Grotesk',sans-serif" };
const tipStyle = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 12, boxShadow: "0 6px 18px rgba(0,0,0,.08)" };

function MiniLine({ data, color }) {
  if (!data.length) return <NoData />;
  return (
    <div style={{ height: 132, marginTop: 6 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="t" stroke={C.border} tick={axisTick} interval="preserveStartEnd" minTickGap={18} />
          <YAxis stroke={C.border} tick={axisTick} allowDecimals={false} width={34} />
          <Tooltip contentStyle={tipStyle} />
          <Line type="monotone" dataKey="v" name="Atual" stroke={color} strokeWidth={2.5} dot={{ fill: color, r: 2.5 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
function MultiLine({ data, lines }) {
  if (!data.length) return <NoData />;
  return (
    <>
      <div style={{ height: 132, marginTop: 6 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="t" stroke={C.border} tick={axisTick} interval="preserveStartEnd" minTickGap={18} />
            <YAxis stroke={C.border} tick={axisTick} allowDecimals={false} width={34} />
            <Tooltip contentStyle={tipStyle} />
            {lines.map((l) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2.5} dot={{ fill: l.color, r: 2.5 }} activeDot={{ r: 5 }} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
function StackedBars({ data, series }) {
  if (!data.length) return <NoData />;
  const TotalLabel = ({ x, y, width, index }) => {
    const row = data[index];
    if (!row) return null;
    const total = series.reduce((a, s) => a + (Number(row[s.key]) || 0), 0);
    return <text x={x + width / 2} y={y - 6} textAnchor="middle" fontFamily="'Sora',sans-serif" fontSize="11" fontWeight="700" fill={C.text}>{total}</text>;
  };
  return (
    <>
      <div style={{ height: 142, marginTop: 6 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 10, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="t" stroke={C.border} tick={axisTick} interval="preserveStartEnd" minTickGap={14} />
            <YAxis stroke={C.border} tick={axisTick} allowDecimals={false} width={34} />
            <Tooltip contentStyle={tipStyle} cursor={{ fill: "rgba(0,0,0,.03)" }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="bk" fill={s.color} radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}>
                {i === series.length - 1 && <LabelList content={TotalLabel} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend lines={series} />
    </>
  );
}
function Legend({ lines }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
      {lines.map((l) => (
        <span key={l.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: l.color }} />{l.label}
        </span>
      ))}
    </div>
  );
}

// ---------- blocos de painel ----------
function PanelShell({ title, desc, status, children }) {
  return (
    <div className="kmm-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 1.35, maxWidth: 250 }}>{desc}</div>
        </div>
        {status && <Dot color={status} />}
      </div>
      {children}
    </div>
  );
}
function Atual({ value, unit }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: C.faint }}>ATUAL</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 38, fontWeight: 800, lineHeight: 1, letterSpacing: "-.02em" }}>{value}</span>
        <span style={{ color: C.muted, fontSize: 13 }}>{unit}</span>
      </div>
    </div>
  );
}
function EditNum({ value, onChange, label }) {
  return (
    <label style={{ display: "block", flex: 1 }}>
      {label && <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      <input className="kmm-input" type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function MetaEditor({ pair, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.border}` }}>
      <EditNum label="Meta verde ≤" value={pair[0]} onChange={(v) => onChange(0, v)} />
      <EditNum label="Amarelo ≤" value={pair[1]} onChange={(v) => onChange(1, v)} />
    </div>
  );
}

function ScalarPanel({ title, desc, unit, atual, meta, editing, onVal, onMeta, rows, accessor, note, latestHeadline, monthly }) {
  const baseRows = monthly ? lastPerMonth(rows) : rows;
  const series = baseRows.map((r) => ({ t: monthly ? fmtMonth(r.ts) : r.t, v: accessor(r.d) }));
  const headline = series.length ? series[series.length - 1].v : atual;
  const status = statusColor(headline, meta);
  return (
    <PanelShell title={title} desc={desc} status={status}>
      {editing
        ? (<><EditNum value={atual} onChange={onVal} /><MetaEditor pair={meta} onChange={onMeta} /></>)
        : (<><Atual value={headline} unit={unit} /><MiniLine data={series} color={C.orange} /></>)}
      {note && <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.border}`, fontSize: 11, color: C.muted, fontStyle: "italic", lineHeight: 1.4 }}>{note}</div>}
    </PanelShell>
  );
}

function BacklogPanel({ atual, meta, editing, onVal, onMeta, rows }) {
  const monthly = lastPerMonth(rows);
  const latest = monthly.length ? monthly[monthly.length - 1].b : atual;
  const total = sum(latest);
  const status = statusColor(total, meta);
  const series = [
    { key: "execucao", label: "Execução", color: C.orange },
    { key: "delivery", label: "Delivery", color: C.dark },
  ];
  const data = monthly.map((r) => ({ t: fmtMonth(r.ts), execucao: r.b.execucao, delivery: r.b.delivery }));
  return (
    <PanelShell title="Backlog em esteira" desc="Demandas em execução e em delivery, ao longo dos snapshots." status={status}>
      {editing ? (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <EditNum label="Execução" value={atual.execucao} onChange={(v) => onVal("execucao", v)} />
            <EditNum label="Delivery" value={atual.delivery} onChange={(v) => onVal("delivery", v)} />
          </div>
          <MetaEditor pair={meta} onChange={onMeta} />
        </>
      ) : (
        <><Atual value={total} unit="demandas" /><StackedBars data={data} series={series} /></>
      )}
    </PanelShell>
  );
}

// painel KMM5 com Custom / Integr / Total e filtro de séries
function DualTotalPanel({ title, desc, unit, aLabel, aVal, bLabel, bVal, meta, editing, onValA, onValB, onMeta, rows, accA, accB, showTotal = true, monthly }) {
  const [vis, setVis] = useState({ a: true, b: true, total: showTotal });
  const baseRows = monthly ? lastPerMonth(rows) : rows;
  const data = baseRows.map((r) => { const a = accA(r.d), b = accB(r.d); return { t: monthly ? fmtMonth(r.ts) : r.t, a, b, total: a + b }; });
  const dispA = baseRows.length ? accA(baseRows[baseRows.length - 1].d) : aVal;
  const dispB = baseRows.length ? accB(baseRows[baseRows.length - 1].d) : bVal;
  const status = statusColor(Math.max(dispA, dispB), meta);
  const allLines = [
    { key: "a", label: aLabel, color: C.orange },
    { key: "b", label: bLabel, color: C.dark },
    ...(showTotal ? [{ key: "total", label: "Total", color: C.blue }] : []),
  ];
  const lines = allLines.filter((l) => vis[l.key]);
  const toggle = (k) => setVis((v) => ({ ...v, [k]: !v[k] }));
  const atualsAll = [
    { key: "a", label: aLabel, value: dispA },
    { key: "b", label: bLabel, value: dispB },
    ...(showTotal ? [{ key: "total", label: "Total", value: dispA + dispB }] : []),
  ];
  const atuals = atualsAll.filter((i) => vis[i.key]);
  return (
    <PanelShell title={title} desc={desc} status={status}>
      {editing ? (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <EditNum label={aLabel} value={aVal} onChange={onValA} />
            <EditNum label={bLabel} value={bVal} onChange={onValB} />
          </div>
          <MetaEditor pair={meta} onChange={onMeta} />
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            {allLines.map((l) => (
              <button key={l.key} className={`kmm-chip ${vis[l.key] ? "on" : ""}`} onClick={() => toggle(l.key)}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: vis[l.key] ? l.color : C.faint }} />{l.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 2 }}>
            {(atuals.length ? atuals : atualsAll).map((i) => (
              <div key={i.key}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: C.faint }}>{i.label.toUpperCase()}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{i.value}</span>
                  <span style={{ color: C.muted, fontSize: 11 }}>{unit}</span>
                </div>
              </div>
            ))}
          </div>
          <MultiLine data={data} lines={lines.length ? lines : allLines} />
        </>
      )}
    </PanelShell>
  );
}

// painel de fluxo de demandas (linha: abertas / finalizadas / negadas)
function FlowPanel({ product, fluxoKey = "fluxo", title = "Fluxo de demandas", note, rows, atual, editing, onVal }) {
  const lines = [
    { key: "abertas", label: "Demandas abertas", short: "Abertas", color: C.orange },
    { key: "finalizadas", label: "Demandas finalizadas", short: "Finalizadas", color: C.green },
    { key: "negadas", label: "Demandas Negadas/Canceladas", short: "Negadas/Canc.", color: C.red },
  ];
  const [vis, setVis] = useState({ abertas: true, finalizadas: true, negadas: true });
  const toggle = (k) => setVis((v) => ({ ...v, [k]: !v[k] }));
  const monthly = lastPerMonth(rows);
  const data = monthly.map((r) => { const f = r.d[product][fluxoKey]; return { t: fmtMonth(r.ts), abertas: f.abertas, finalizadas: f.finalizadas, negadas: f.negadas }; });
  const latest = monthly.length ? monthly[monthly.length - 1].d[product][fluxoKey] : atual;
  const shown = lines.filter((l) => vis[l.key]);
  const plot = shown.length ? shown : lines;
  return (
    <PanelShell title={title} desc="Abertas, finalizadas e negadas/canceladas por snapshot.">
      {editing ? (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr" }}>
          <EditNum label="Abertas" value={atual.abertas} onChange={(v) => onVal("abertas", v)} />
          <EditNum label="Finalizadas" value={atual.finalizadas} onChange={(v) => onVal("finalizadas", v)} />
          <EditNum label="Negadas/Cancel." value={atual.negadas} onChange={(v) => onVal("negadas", v)} />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            {lines.map((l) => (
              <button key={l.key} className={`kmm-chip ${vis[l.key] ? "on" : ""}`} onClick={() => toggle(l.key)}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: vis[l.key] ? l.color : C.faint }} />{l.short}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 2 }}>
            {plot.map((l) => (
              <div key={l.key}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: C.faint }}>{l.short.toUpperCase()}</div>
                <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 24, fontWeight: 800, lineHeight: 1, color: l.color }}>{latest[l.key]}</span>
              </div>
            ))}
          </div>
          <MultiLine data={data} lines={plot} />
          <Legend lines={plot} />
        </>
      )}
      {note && <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.border}`, fontSize: 11, color: C.muted, fontStyle: "italic", lineHeight: 1.4 }}>{note}</div>}
    </PanelShell>
  );
}

// painel de barra única mensal (mesmo visual do Backlog em esteira, 1 série) — usado no Backlog de viabilidade
function SingleBarPanel({ title, desc, unit, atual, meta, editing, onVal, onMeta, rows, accessor, color = C.orange }) {
  const monthly = lastPerMonth(rows);
  const data = monthly.map((r) => ({ t: fmtMonth(r.ts), v: accessor(r.d) }));
  const headline = monthly.length ? accessor(monthly[monthly.length - 1].d) : atual;
  const status = statusColor(headline, meta);
  return (
    <PanelShell title={title} desc={desc} status={status}>
      {editing ? (
        <><EditNum value={atual} onChange={onVal} /><MetaEditor pair={meta} onChange={onMeta} /></>
      ) : (
        <>
          <Atual value={headline} unit={unit} />
          {data.length ? (
            <div style={{ height: 142, marginTop: 6 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 22, right: 10, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="t" stroke={C.border} tick={axisTick} interval="preserveStartEnd" minTickGap={14} />
                  <YAxis stroke={C.border} tick={axisTick} allowDecimals={false} width={34} />
                  <Tooltip contentStyle={tipStyle} cursor={{ fill: "rgba(0,0,0,.03)" }} />
                  <Bar dataKey="v" name={title} fill={color} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="v" position="top" fill={C.text} fontSize={11} style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <NoData />}
        </>
      )}
    </PanelShell>
  );
}

// ---------- KMM4 ----------
function KMM4({ data, th, editing, setVal, setThVal, rows }) {
  const d = data.kmm4, t = th.kmm4;
  const bkRows = rows.map((r) => ({ ts: r.ts, t: r.t, b: r.d.kmm4.backlog }));
  return (
    <>
      <FlowPanel product="kmm4" rows={rows} atual={d.fluxo} editing={editing} onVal={(k, v) => setVal(["kmm4", "fluxo", k], v)} />
      <ScalarPanel title="Aging de viabilidade" desc="Idade das requisições pendentes de análise pelo time." unit="dias"
        atual={d.aging} meta={t.aging} editing={editing} onVal={(v) => setVal(["kmm4", "aging"], v)} onMeta={(i, v) => setThVal("aging", i, v)} rows={rows} accessor={(x) => x.kmm4.aging}
        latestHeadline monthly
        note="Agging de dez - fev/26 estimado em 120 dias. Calibragem da medição á partir de 03/26" />
      <SingleBarPanel title="Backlog de viabilidade" desc="Demandas aguardando análise de viabilidade (último snapshot do mês)." unit="demandas"
        atual={d.backlogViab} meta={t.backlogViab} editing={editing} onVal={(v) => setVal(["kmm4", "backlogViab"], v)} onMeta={(i, v) => setThVal("backlogViab", i, v)} rows={rows} accessor={(x) => x.kmm4.backlogViab} />
      <BacklogPanel atual={d.backlog} meta={t.backlog} editing={editing} onVal={(k, v) => setVal(["kmm4", "backlog", k], v)} onMeta={(i, v) => setThVal("backlog", i, v)} rows={bkRows} />
      <ScalarPanel title="Lead Time de EDI (PROCEDA)" desc="Tempo para deploy de demandas de EDI padrão PROCEDA." unit="dias"
        atual={d.leadEdi} meta={t.leadEdi} editing={editing} onVal={(v) => setVal(["kmm4", "leadEdi"], v)} onMeta={(i, v) => setThVal("leadEdi", i, v)} rows={rows} accessor={(x) => x.kmm4.leadEdi} monthly />
      <ScalarPanel title="% Customização em módulos legados" desc="Parcela de demandas em módulos descontinuados." unit="%"
        atual={d.legado} meta={t.legado} editing={editing} onVal={(v) => setVal(["kmm4", "legado"], v)} onMeta={(i, v) => setThVal("legado", i, v)} rows={rows} accessor={(x) => x.kmm4.legado} />
      <ScalarPanel title="Prontas há mais de 30 dias" desc="Demandas prontas para entrega ao cliente com idade > 30 dias." unit="demandas"
        atual={d.prontas30} meta={t.prontas30} editing={editing} onVal={(v) => setVal(["kmm4", "prontas30"], v)} onMeta={(i, v) => setThVal("prontas30", i, v)} rows={rows} accessor={(x) => x.kmm4.prontas30} />
    </>
  );
}

// ---------- KMM5 ----------
function KMM5({ data, th, editing, setVal, setThVal, rows }) {
  const d = data.kmm5, t = th.kmm5;
  const bkRows = rows.map((r) => ({ ts: r.ts, t: r.t, b: r.d.kmm5.backlog }));
  return (
    <>
      <FlowPanel product="kmm5" fluxoKey="fluxoCarteira" title="Fluxo de Demandas Carteira e Projetos" note="Demandas de carteira, projeto de implantações e migrações" rows={rows} atual={d.fluxoCarteira} editing={editing} onVal={(k, v) => setVal(["kmm5", "fluxoCarteira", k], v)} />
      <FlowPanel product="kmm5" fluxoKey="fluxoDedicada" title="Fluxo de Demandas Dedicadas" note="Demandas das dedicadas Transben e Maroni" rows={rows} atual={d.fluxoDedicada} editing={editing} onVal={(k, v) => setVal(["kmm5", "fluxoDedicada", k], v)} />
      <DualTotalPanel title="Aging de viabilidade" desc="Idade das requisições pendentes de análise, por tipo." unit="d"
        aLabel="Customizações" aVal={d.agingViab.customizacoes} bLabel="Integrações" bVal={d.agingViab.integracoes}
        meta={t.agingViab} editing={editing} showTotal={false} monthly
        onValA={(v) => setVal(["kmm5", "agingViab", "customizacoes"], v)} onValB={(v) => setVal(["kmm5", "agingViab", "integracoes"], v)} onMeta={(i, v) => setThVal("agingViab", i, v)}
        rows={rows} accA={(x) => x.kmm5.agingViab.customizacoes} accB={(x) => x.kmm5.agingViab.integracoes} />
      <SingleBarPanel title="Backlog de viabilidade" desc="Demandas aguardando análise de viabilidade (último snapshot do mês)." unit="demandas"
        atual={d.backlogViab} meta={t.backlogViab} editing={editing} onVal={(v) => setVal(["kmm5", "backlogViab"], v)} onMeta={(i, v) => setThVal("backlogViab", i, v)} rows={rows} accessor={(x) => x.kmm5.backlogViab} />
      <BacklogPanel atual={d.backlog} meta={t.backlog} editing={editing} onVal={(k, v) => setVal(["kmm5", "backlog", k], v)} onMeta={(i, v) => setThVal("backlog", i, v)} rows={bkRows} />
      <DualTotalPanel title="Lead Time de Entregas" desc="Tempo para deploy de demandas, por tipo." unit="d"
        aLabel="Integrações" aVal={d.leadEntrega.integracoes} bLabel="Customizações" bVal={d.leadEntrega.customizacoes}
        meta={t.leadEntrega} editing={editing}
        onValA={(v) => setVal(["kmm5", "leadEntrega", "integracoes"], v)} onValB={(v) => setVal(["kmm5", "leadEntrega", "customizacoes"], v)} onMeta={(i, v) => setThVal("leadEntrega", i, v)}
        rows={rows} accA={(x) => x.kmm5.leadEntrega.integracoes} accB={(x) => x.kmm5.leadEntrega.customizacoes} />
      <ScalarPanel title="Incidentes críticos pós-deploy" desc="Incidentes de emergência ocasionados por atualização de versão." unit="incidentes"
        atual={d.incidentes} meta={t.incidentes} editing={editing} onVal={(v) => setVal(["kmm5", "incidentes"], v)} onMeta={(i, v) => setThVal("incidentes", i, v)} rows={rows} accessor={(x) => x.kmm5.incidentes} />
      <ScalarPanel title="Prontas há mais de 30 dias" desc="Demandas prontas para entrega ao cliente com idade > 30 dias." unit="demandas"
        atual={d.prontas30} meta={t.prontas30} editing={editing} onVal={(v) => setVal(["kmm5", "prontas30"], v)} onMeta={(i, v) => setThVal("prontas30", i, v)} rows={rows} accessor={(x) => x.kmm5.prontas30} />
    </>
  );
}

// ---------- Aging (placar: tabela + barras) ----------
function AgingScoreboard({ label, dist, product, catKey, history }) {
  const [mode, setMode] = useState("dist");
  const total = AGING_BUCKETS.reduce((a, bk) => a + num(dist[bk.key]), 0);
  const chart = AGING_BUCKETS.map((bk) => ({ name: bk.short, value: num(dist[bk.key]), color: bk.color }));
  const evo = history.map((h) => ({ t: fmtShort(h.ts), v: num(getPath(h.data, [product, "agingDist", catKey, "gt45"])) }));
  const cell = { padding: "6px 4px" };
  const cellR = { padding: "6px 4px", textAlign: "right", fontFamily: "'Sora',sans-serif", fontWeight: 700 };
  return (
    <div className="kmm-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 14 }}>{label}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`kmm-chip ${mode === "dist" ? "on" : ""}`} onClick={() => setMode("dist")}>Distribuição</button>
          <button className={`kmm-chip ${mode === "evo" ? "on" : ""}`} onClick={() => setMode("evo")}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: C.red }} />Evolução &gt; 45d
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", alignItems: "center" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: C.muted, textAlign: "left", fontSize: 11 }}>
              <th style={cell}>Faixa</th><th style={{ ...cell, textAlign: "right" }}>Qtd</th><th style={{ ...cell, textAlign: "right" }}>%</th>
            </tr>
          </thead>
          <tbody>
            {AGING_BUCKETS.map((bk) => {
              const v = num(dist[bk.key]); const p = total ? Math.round((v / total) * 100) : 0;
              return (
                <tr key={bk.key} style={{ borderTop: `1px solid ${C.grid}` }}>
                  <td style={cell}><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: bk.color }} />{bk.label}</span></td>
                  <td style={cellR}>{v}</td>
                  <td style={{ ...cellR, color: C.muted, fontWeight: 500 }}>{p}%</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: `2px solid ${C.border}` }}>
              <td style={{ ...cell, fontFamily: "'Sora',sans-serif", fontWeight: 700 }}>Total</td>
              <td style={cellR}>{total}</td><td style={cellR}>100%</td>
            </tr>
          </tbody>
        </table>
        <div style={{ height: 158 }}>
          {mode === "dist" ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 18, right: 6, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="name" stroke={C.border} tick={{ fill: C.muted, fontSize: 10, fontFamily: "'Hanken Grotesk',sans-serif" }} interval={0} />
                <YAxis stroke={C.border} tick={axisTick} allowDecimals={false} width={28} />
                <Tooltip contentStyle={tipStyle} cursor={{ fill: "rgba(0,0,0,.03)" }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chart.map((c, i) => <Cell key={i} fill={c.color} />)}
                  <LabelList dataKey="value" position="top" fill={C.text} fontSize={11} style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : evo.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evo} margin={{ top: 18, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="t" stroke={C.border} tick={axisTick} interval="preserveStartEnd" minTickGap={16} />
                <YAxis stroke={C.border} tick={axisTick} allowDecimals={false} width={28} />
                <Tooltip contentStyle={tipStyle} />
                <Line type="monotone" dataKey="v" name="> 45 dias" stroke={C.red} strokeWidth={2.5} dot={{ fill: C.red, r: 3 }} activeDot={{ r: 5 }}>
                  <LabelList dataKey="v" position="top" fill={C.text} fontSize={10} style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700 }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 11, textAlign: "center" }}>Sem snapshots para a evolução.</div>
          )}
        </div>
      </div>
      {mode === "evo" && <div style={{ marginTop: 8, fontSize: 10, color: C.faint, fontStyle: "italic" }}>Evolução de “Mais que 45 dias” em todos os snapshots — não afetada pelo filtro de Referência.</div>}
    </div>
  );
}
function AgingTab({ product, liveData, history }) {
  const opts = [
    { id: "atual", label: "Atual (não salvo)", data: liveData },
    ...[...history].reverse().map((h) => ({ id: h.id, label: fmtBR(h.ts), data: h.data })),
  ];
  const [sel, setSel] = useState("latest");
  const resolve = (s) => {
    if (s === "latest" || (s !== "atual" && !history.some((h) => h.id === s))) return history.length ? history[history.length - 1].id : "atual";
    return s;
  };
  const curId = resolve(sel);
  const current = opts.find((o) => o.id === curId) || opts[0];
  const dist = current.data[product].agingDist;
  return (
    <div className="kmm-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div className="kmm-band">{product.toUpperCase()} — Aging por etapa</div>
        <label style={{ fontSize: 10, color: C.muted, fontWeight: 600, display: "flex", flexDirection: "column", gap: 2 }}>Referência
          <select className="kmm-input" style={{ width: "auto", minWidth: 190 }} value={curId} onChange={(e) => setSel(e.target.value)}>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {AGING_CATS.map((cat) => <AgingScoreboard key={cat.key} label={cat.label} dist={dist[cat.key]} product={product} catKey={cat.key} history={history} />)}
      </div>
    </div>
  );
}

// ---------- matriz de aging reutilizável ----------
function AgingMatrix({ product, data, onCell }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ color: C.muted }}>
            <th style={{ textAlign: "left", padding: "4px 4px", minWidth: 120 }}>Etapa</th>
            {AGING_BUCKETS.map((bk) => <th key={bk.key} style={{ padding: "4px 2px", fontSize: 10 }}>{bk.short}</th>)}
          </tr>
        </thead>
        <tbody>
          {AGING_CATS.map((cat) => (
            <tr key={cat.key} style={{ borderTop: `1px solid ${C.grid}` }}>
              <td style={{ padding: "5px 4px", fontWeight: 600 }}>{cat.label}</td>
              {AGING_BUCKETS.map((bk) => (
                <td key={bk.key} style={{ padding: "4px 2px" }}>
                  <input className="kmm-input" type="number" style={{ padding: "5px 5px", fontSize: 12, textAlign: "center" }}
                    value={getPath(data, [product, "agingDist", cat.key, bk.key])} onChange={(e) => onCell(product, cat.key, bk.key, e.target.value)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Entrada (input rápido) ----------
function InputTab({ data, setVal, draftDate, setDraftDate, onRegister, onPrefill, hasHistory }) {
  return (
    <div className="kmm-fade">
      <div className="kmm-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15 }}>Entrada de dados</div>
            <div style={{ fontSize: 12, color: C.muted, maxWidth: 460, marginTop: 3 }}>
              Preencha os valores abaixo (são o “Atual”) e clique em registrar para gravar um snapshot na data escolhida. Se já existir um snapshot nessa data, ele é atualizado.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Data do snapshot
              <input className="kmm-input" type="date" style={{ width: 160 }} value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
            </label>
            {hasHistory && <button className="kmm-btn" onClick={onPrefill}>Pré-preencher c/ último</button>}
            <button className="kmm-btn primary" onClick={onRegister}>Registrar snapshot</button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))" }}>
        {["kmm4", "kmm5"].map((p) => (
          <div key={p} className="kmm-card">
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: ".06em", color: C.orange, marginBottom: 12 }}>{p.toUpperCase()}</div>

            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8 }}>INDICADORES</div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginBottom: 18 }}>
              {IND_FIELDS[p].map((f) => (
                <EditNum key={f.path.join(".")} label={f.label} value={getPath(data, f.path)} onChange={(v) => setVal(f.path, v)} />
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8 }}>AGING POR ETAPA (qtd por faixa)</div>
            <AgingMatrix product={p} data={data} onCell={(pp, ck, bk, v) => setVal([pp, "agingDist", ck, bk], v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Snapshots ----------
function SnapshotManager({ history, expandedId, setExpandedId, onAdd, onDate, onVal, onDelete, onExport, onReplace, onNotify }) {
  const fileRef = useRef(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseSnapshotsCSV(ev.target.result);
        if (!parsed.length) { onNotify("CSV sem linhas de dados."); return; }
        onReplace(parsed);
      } catch (err) { onNotify("Não consegui ler o CSV — mantenha a linha de cabeçalho."); }
    };
    reader.readAsText(file, "utf-8");
  };
  return (
    <div className="kmm-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div style={{ color: C.muted, fontSize: 13 }}>{history.length === 0 ? "Nenhum snapshot ainda." : `${history.length} snapshot(s) — ordenados por data.`}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="kmm-btn" onClick={onExport}>Exportar CSV</button>
          <button className="kmm-btn" onClick={() => fileRef.current && fileRef.current.click()}>Importar CSV</button>
          <button className="kmm-btn primary" onClick={onAdd}>+ Adicionar snapshot</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
        </div>
      </div>
      <div style={{ color: C.faint, fontSize: 11, marginBottom: 16 }}>
        Edição rápida na aba “Entrada”. Aqui você ajusta data, indicadores e o CSV. Importar CSV substitui os snapshots atuais. “Exportar” sem snapshots gera um modelo em branco (delimitador “;”).
      </div>
      {history.length === 0 && (
        <div className="kmm-card" style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "34px 0" }}>Adicione um snapshot ou use a aba “Entrada”.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {history.map((s) => {
          const open = expandedId === s.id;
          return (
            <div key={s.id} className="kmm-card" style={{ padding: 0 }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14, padding: "14px 18px" }}>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4 }}>DATA</div>
                  <input className="kmm-input" type="date" style={{ width: 160 }} value={tsToInput(s.ts)} onChange={(e) => onDate(s.id, e.target.value)} />
                </div>
                <div style={{ flex: 1, minWidth: 180, display: "flex", gap: 18, flexWrap: "wrap" }}>
                  <Summary label="KMM4 backlog" value={sum(s.data.kmm4.backlog)} />
                  <Summary label="KMM4 lead EDI" value={s.data.kmm4.leadEdi} />
                  <Summary label="KMM5 backlog" value={sum(s.data.kmm5.backlog)} />
                  <Summary label="KMM5 incidentes" value={s.data.kmm5.incidentes} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="kmm-btn sm" onClick={() => setExpandedId(open ? null : s.id)}>{open ? "Fechar" : "Editar valores"}</button>
                  {confirmDel === s.id ? (
                    <>
                      <button className="kmm-btn sm primary" style={{ background: C.red, borderColor: C.red }} onClick={() => { onDelete(s.id); setConfirmDel(null); }}>Confirmar</button>
                      <button className="kmm-btn sm" onClick={() => setConfirmDel(null)}>Cancelar</button>
                    </>
                  ) : (
                    <button className="kmm-btn sm" style={{ color: C.red }} onClick={() => setConfirmDel(s.id)}>Excluir</button>
                  )}
                </div>
              </div>
              {open && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px 18px", display: "grid", gap: 22, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                  {["kmm4", "kmm5"].map((p) => (
                    <div key={p}>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: C.orange, marginBottom: 10 }}>{p.toUpperCase()}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 6 }}>INDICADORES</div>
                      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
                        {IND_FIELDS[p].map((f) => <EditNum key={f.path.join(".")} label={f.label} value={getPath(s.data, f.path)} onChange={(v) => onVal(s.id, f.path, v)} />)}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 6 }}>AGING POR ETAPA (qtd por faixa)</div>
                      <AgingMatrix product={p} data={s.data} onCell={(pp, ck, bk, v) => onVal(s.id, [pp, "agingDist", ck, bk], v)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function Summary({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

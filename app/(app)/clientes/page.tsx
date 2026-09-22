"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Plus } from "lucide-react";
import { useProduto } from "@/components/ProdutoContext";
import { C, corDeStatus } from "@/lib/kmm-theme";

type Cliente = {
  id: string;
  nome: string;
  produto: "KMM4" | "KMM5";
  responsavel: string | null;
  ultimoContato: string | null;
  situacao: "EM_DIA" | "ACOMPANHAR" | "CRITICO";
};

const SITUACAO_LABEL: Record<Cliente["situacao"], string> = {
  EM_DIA: "Em dia",
  ACOMPANHAR: "Acompanhar",
  CRITICO: "Crítico",
};

export default function ClientesPage() {
  const { produto } = useProduto();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [novo, setNovo] = useState({ nome: "", produto: "KMM5", responsavel: "", ultimoContato: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [mensagemImport, setMensagemImport] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const url = produto === "AMBOS" ? "/api/clientes" : `/api/clientes?produto=${produto}`;
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json();
      setClientes(j.clientes ?? []);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto]);

  async function salvarNovo() {
    if (!novo.nome) return;
    await fetch("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novo),
    });
    setNovo({ nome: "", produto: "KMM5", responsavel: "", ultimoContato: "" });
    setFormAberto(false);
    carregar();
  }

  async function importarArquivo(file: File) {
    setImportando(true);
    setMensagemImport(null);
    try {
      const form = new FormData();
      form.append("arquivo", file);
      const res = await fetch("/api/clientes/import", { method: "POST", body: form });
      const j = await res.json();
      if (!res.ok) throw new Error(j.erro ?? "Falha na importação.");
      setMensagemImport(`${j.importados} cliente(s) importado(s) com sucesso.`);
      carregar();
    } catch (e: any) {
      setMensagemImport(e.message ?? "Falha na importação.");
    } finally {
      setImportando(false);
    }
  }

  const total = clientes.length;
  const emKmm4 = clientes.filter((c) => c.produto === "KMM4").length;
  const emKmm5 = clientes.filter((c) => c.produto === "KMM5").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>Gestão de clientes</h1>
          <p style={{ color: C.muted, marginTop: 4 }}>Carteira do time de Produto, com responsável, situação e último contato.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && importarArquivo(e.target.files[0])}
          />
          <button className="kmm-btn" onClick={() => fileInputRef.current?.click()} disabled={importando}>
            <Upload size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            {importando ? "Importando…" : "Importar Excel"}
          </button>
          <button className="kmm-btn primary" onClick={() => setFormAberto((v) => !v)}>
            <Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Novo cliente
          </button>
        </div>
      </div>

      {mensagemImport && (
        <div className="kmm-card" style={{ marginBottom: 16, fontSize: 13 }}>{mensagemImport}</div>
      )}

      {formAberto && (
        <div className="kmm-card" style={{ marginBottom: 20, display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 12, color: C.muted }}>Cliente</label>
            <input className="kmm-input" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: C.muted }}>Produto</label>
            <select className="kmm-input" value={novo.produto} onChange={(e) => setNovo({ ...novo, produto: e.target.value })}>
              <option value="KMM4">KMM4</option>
              <option value="KMM5">KMM5</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: C.muted }}>Responsável</label>
            <input className="kmm-input" value={novo.responsavel} onChange={(e) => setNovo({ ...novo, responsavel: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: C.muted }}>Último contato</label>
            <input className="kmm-input" type="date" value={novo.ultimoContato} onChange={(e) => setNovo({ ...novo, ultimoContato: e.target.value })} />
          </div>
          <button className="kmm-btn primary" onClick={salvarNovo}>Salvar</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <KpiCard titulo="CLIENTES NA VISÃO" valor={total} />
        <KpiCard titulo="EM KMM4 (LEGADO)" valor={emKmm4} />
        <KpiCard titulo="EM KMM5 (NOVO)" valor={emKmm5} />
      </div>

      <div className="kmm-card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
              {["Cliente", "Produto", "Responsável", "Último contato", "Situação"].map((h) => (
                <th key={h} style={{ padding: "12px 18px", fontSize: 13, color: C.muted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td style={{ padding: 18, color: C.muted }} colSpan={5}>Carregando…</td></tr>
            ) : clientes.length === 0 ? (
              <tr><td style={{ padding: 18, color: C.muted }} colSpan={5}>Nenhum cliente cadastrado ainda.</td></tr>
            ) : (
              clientes.map((c) => {
                const cor = corDeStatus(SITUACAO_LABEL[c.situacao]);
                return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "14px 18px" }}>{c.nome}</td>
                    <td style={{ padding: "14px 18px", color: C.orange, fontWeight: 600 }}>{c.produto}</td>
                    <td style={{ padding: "14px 18px" }}>{c.responsavel ?? "—"}</td>
                    <td style={{ padding: "14px 18px" }}>
                      {c.ultimoContato ? new Date(c.ultimoContato).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span className="kmm-chip" style={{ background: cor.bg, color: cor.fg, borderColor: "transparent" }}>
                        {SITUACAO_LABEL[c.situacao]}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="kmm-card">
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: ".04em" }}>{titulo}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: C.text, marginTop: 6 }}>{valor}</div>
    </div>
  );
}

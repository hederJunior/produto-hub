"use client";

import { useEffect, useState } from "react";
import { Trash2, Pencil, X } from "lucide-react";
import { C } from "@/lib/kmm-theme";

type Dev = { id: string; nome: string; papel: string | null; produto: "KMM4" | "KMM5" };

const PAPEIS = ["Frontend", "Backend", "Full stack", "QA automation", "Mobile"];

/**
 * Cadastro de devs (Administração > Cadastro de devs, pedido por Heder em 2026-09-30): base
 * manual que alimenta o pool de "Desenvolvedores disponíveis" e o select de dev na função
 * "Cadastrar disponibilidade" do painel "Planejamento de capacidade" (Roadmap > Sprints). Mesma
 * tabela DevCapacidade que a auto-alocação usa — um dev cadastrado aqui convive normalmente com
 * os que aparecem sozinhos a partir de Task/Bug do Azure DevOps.
 */
export default function CadastroDevsPage() {
  const [produto, setProduto] = useState<"KMM4" | "KMM5">("KMM5");
  const [devs, setDevs] = useState<Dev[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    fetch(`/api/admin/devs?produto=${produto}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setDevs(j.devs ?? []))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
    setNome("");
    setPapel("");
    setEditandoId(null);
    setMensagem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto]);

  function iniciarEdicao(dev: Dev) {
    setEditandoId(dev.id);
    setNome(dev.nome);
    setPapel(dev.papel ?? "");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setNome("");
    setPapel("");
  }

  async function salvar() {
    if (!nome.trim()) {
      setMensagem("Informe o nome do dev.");
      return;
    }
    setSalvando(true);
    setMensagem(null);
    try {
      const res = editandoId
        ? await fetch("/api/admin/devs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editandoId, nome, papel: papel || null }),
          })
        : await fetch("/api/admin/devs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ produto, nome, papel: papel || null }),
          });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMensagem(j.erro ?? "Não foi possível salvar.");
        return;
      }
      cancelarEdicao();
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(dev: Dev) {
    await fetch(`/api/admin/devs?id=${dev.id}`, { method: "DELETE" });
    carregar();
  }

  return (
    <div>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>Cadastro de devs</h1>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 20 }}>
        Base de desenvolvedores usada no Planejamento de capacidade (Roadmap e entregas &gt; Sprints). Um dev
        cadastrado aqui fica disponível pra vincular manualmente numa squad/sprint (função "Cadastrar
        disponibilidade"), mesmo antes de ter qualquer Task/Bug atribuída no Azure DevOps.
      </p>

      <div className="kmm-card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Produto</div>
        <select className="kmm-input" style={{ width: "auto", marginBottom: 14 }} value={produto} onChange={(e) => setProduto(e.target.value as "KMM4" | "KMM5")}>
          <option value="KMM4">KMM4</option>
          <option value="KMM5">KMM5</option>
        </select>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Nome</div>
            <input
              type="text"
              className="kmm-input"
              style={{ width: 240 }}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Função (opcional)</div>
            <select className="kmm-input" style={{ width: 160 }} value={papel} onChange={(e) => setPapel(e.target.value)}>
              <option value="">—</option>
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button className="kmm-btn" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : editandoId ? "Salvar alteração" : "Adicionar"}
          </button>
          {editandoId && (
            <button className="kmm-btn" onClick={cancelarEdicao}>
              <X size={14} /> Cancelar
            </button>
          )}
          {mensagem && <span style={{ fontSize: 12.5, color: C.red, alignSelf: "center" }}>{mensagem}</span>}
        </div>
      </div>

      <div className="kmm-card">
        {carregando ? (
          <p style={{ color: C.muted }}>Carregando…</p>
        ) : devs.length === 0 ? (
          <p style={{ color: C.muted }}>Nenhum dev cadastrado pra {produto} ainda.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                {["Nome", "Função", ""].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", fontSize: 12, color: C.muted, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devs.map((dev) => (
                <tr key={dev.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{dev.nome}</td>
                  <td style={{ padding: "8px 10px", color: C.muted }}>{dev.papel ?? "—"}</td>
                  <td style={{ padding: "8px 10px", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="kmm-btn" style={{ padding: 6 }} onClick={() => iniciarEdicao(dev)}>
                      <Pencil size={13} />
                    </button>
                    <button className="kmm-btn" style={{ padding: 6 }} onClick={() => excluir(dev)} title="Também remove as alocações desse dev em squad/sprint">
                      <Trash2 size={13} color={C.red} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

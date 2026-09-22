"use client";

import { useEffect, useState } from "react";
import { Trash2, Pencil, X } from "lucide-react";
import { C } from "@/lib/kmm-theme";
import { mesLabel } from "@/lib/demandas-agregacao";

type Painel = "FLUXO_DEMANDAS" | "AGGING_VIABILIDADE" | "BACKLOG_VIABILIDADE";

type ItemManual = {
  id: string;
  produto: "KMM4" | "KMM5";
  painel: Painel;
  mes: string;
  abertas: number | null;
  encerradas: number | null;
  canceladas: number | null;
  agingMedio: number | null;
  backlogQtd: number | null;
  observacao: string | null;
};

const ABAS: { key: Painel; label: string; descricao: string }[] = [
  { key: "FLUXO_DEMANDAS", label: "Fluxo de Demandas", descricao: "Abertas, encerradas e canceladas do mês." },
  { key: "AGGING_VIABILIDADE", label: "Agging de Viabilidade", descricao: "Aging médio (em dias) das demandas em backlog no mês." },
  { key: "BACKLOG_VIABILIDADE", label: "Backlog de Viabilidade", descricao: "Quantidade de demandas em backlog no fim do mês." },
];

const FORM_VAZIO = { mes: "", abertas: "", encerradas: "", canceladas: "", agingMedio: "", backlogQtd: "", observacao: "" };

/**
 * Lançamento manual de indicadores (REQ01.06) — histórico anterior ao início do JOB de captura
 * automática (ou complemento de meses sem dado confiável no Azure DevOps). Uma sub-aba por painel
 * do dashboard automático, cada uma alimentando IndicadorManual com o discriminador "painel"
 * correspondente. Movida pra dentro de Administração em 2026-09-20 (pedido de Heder) — antes
 * ficava em /indicadores/editar, acessível a qualquer usuário logado.
 */
export default function IndicadoresManuaisPage() {
  const [produto, setProduto] = useState<"KMM4" | "KMM5">("KMM4");
  const [aba, setAba] = useState<Painel>("FLUXO_DEMANDAS");
  const [itens, setItens] = useState<ItemManual[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const abaInfo = ABAS.find((a) => a.key === aba)!;

  function carregar() {
    setCarregando(true);
    fetch(`/api/indicadores-manuais?produto=${produto}&painel=${aba}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setItens(j.itens ?? []))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
    setForm(FORM_VAZIO);
    setEditandoId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto, aba]);

  function iniciarEdicao(item: ItemManual) {
    setEditandoId(item.id);
    setForm({
      mes: item.mes,
      abertas: item.abertas?.toString() ?? "",
      encerradas: item.encerradas?.toString() ?? "",
      canceladas: item.canceladas?.toString() ?? "",
      agingMedio: item.agingMedio?.toString() ?? "",
      backlogQtd: item.backlogQtd?.toString() ?? "",
      observacao: item.observacao ?? "",
    });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
  }

  async function salvar() {
    if (!form.mes) {
      setMensagem("Informe o mês.");
      return;
    }
    setSalvando(true);
    setMensagem(null);

    const payload: Record<string, unknown> = { observacao: form.observacao || null };
    if (aba === "FLUXO_DEMANDAS") {
      payload.abertas = form.abertas === "" ? null : Number(form.abertas);
      payload.encerradas = form.encerradas === "" ? null : Number(form.encerradas);
      payload.canceladas = form.canceladas === "" ? null : Number(form.canceladas);
    } else if (aba === "AGGING_VIABILIDADE") {
      payload.agingMedio = form.agingMedio === "" ? null : Number(form.agingMedio);
    } else {
      payload.backlogQtd = form.backlogQtd === "" ? null : Number(form.backlogQtd);
    }

    try {
      let res: Response;
      if (editandoId) {
        res = await fetch("/api/indicadores-manuais", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editandoId, ...payload }),
        });
      } else {
        res = await fetch("/api/indicadores-manuais", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ produto, painel: aba, mes: form.mes, ...payload }),
        });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMensagem(j.erro ?? "Não foi possível salvar.");
        return;
      }
      setForm(FORM_VAZIO);
      setEditandoId(null);
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    await fetch(`/api/indicadores-manuais?id=${id}`, { method: "DELETE" });
    carregar();
  }

  return (
    <div>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>Indicadores manuais</h1>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 20 }}>
        Lançamento de valores mensais por fora do JOB automático — use pra preencher meses anteriores ao início da
        captura, ou pra corrigir um mês específico. Um mês lançado aqui substitui o calculado automaticamente no
        painel de indicadores, sempre pro produto e mês escolhidos (o dado manual não tem recorte de Cliente/Squad).
      </p>

      <div className="kmm-card" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Produto</div>
          <select className="kmm-input" value={produto} onChange={(e) => setProduto(e.target.value as "KMM4" | "KMM5")}>
            <option value="KMM4">KMM4</option>
            <option value="KMM5">KMM5</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ABAS.map((a) => (
            <button
              key={a.key}
              className="kmm-chip"
              onClick={() => setAba(a.key)}
              style={{
                cursor: "pointer",
                border: `1px solid ${aba === a.key ? C.orange : C.border}`,
                color: aba === a.key ? C.orange : C.faint,
                background: aba === a.key ? `${C.orange}14` : "#fff",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="kmm-card" style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "Sora,sans-serif", fontSize: 17, color: C.text, marginBottom: 2 }}>{abaInfo.label} — {produto}</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>{abaInfo.descricao}</div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Mês</div>
            <input
              type="month"
              className="kmm-input"
              value={form.mes}
              disabled={!!editandoId}
              onChange={(e) => setForm((f) => ({ ...f, mes: e.target.value }))}
            />
          </div>

          {aba === "FLUXO_DEMANDAS" && (
            <>
              <div>
                <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Abertas</div>
                <input type="number" className="kmm-input" style={{ width: 100 }} value={form.abertas} onChange={(e) => setForm((f) => ({ ...f, abertas: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Encerradas</div>
                <input type="number" className="kmm-input" style={{ width: 100 }} value={form.encerradas} onChange={(e) => setForm((f) => ({ ...f, encerradas: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Canceladas</div>
                <input type="number" className="kmm-input" style={{ width: 100 }} value={form.canceladas} onChange={(e) => setForm((f) => ({ ...f, canceladas: e.target.value }))} />
              </div>
            </>
          )}

          {aba === "AGGING_VIABILIDADE" && (
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Aging médio (dias)</div>
              <input type="number" className="kmm-input" style={{ width: 120 }} value={form.agingMedio} onChange={(e) => setForm((f) => ({ ...f, agingMedio: e.target.value }))} />
            </div>
          )}

          {aba === "BACKLOG_VIABILIDADE" && (
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Backlog (qtd.)</div>
              <input type="number" className="kmm-input" style={{ width: 120 }} value={form.backlogQtd} onChange={(e) => setForm((f) => ({ ...f, backlogQtd: e.target.value }))} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Observação (opcional)</div>
            <input type="text" className="kmm-input" style={{ width: "100%" }} value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} />
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
        ) : itens.length === 0 ? (
          <p style={{ color: C.muted }}>Nenhum lançamento manual pra {produto} em {abaInfo.label}.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                {(aba === "FLUXO_DEMANDAS"
                  ? ["Mês", "Abertas", "Encerradas", "Canceladas", "Observação", ""]
                  : aba === "AGGING_VIABILIDADE"
                  ? ["Mês", "Aging médio", "Observação", ""]
                  : ["Mês", "Backlog", "Observação", ""]
                ).map((h) => (
                  <th key={h} style={{ padding: "8px 10px", fontSize: 12, color: C.muted, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{mesLabel(item.mes)}</td>
                  {aba === "FLUXO_DEMANDAS" && (
                    <>
                      <td style={{ padding: "8px 10px" }}>{item.abertas ?? "—"}</td>
                      <td style={{ padding: "8px 10px" }}>{item.encerradas ?? "—"}</td>
                      <td style={{ padding: "8px 10px" }}>{item.canceladas ?? "—"}</td>
                    </>
                  )}
                  {aba === "AGGING_VIABILIDADE" && <td style={{ padding: "8px 10px" }}>{item.agingMedio ?? "—"}</td>}
                  {aba === "BACKLOG_VIABILIDADE" && <td style={{ padding: "8px 10px" }}>{item.backlogQtd ?? "—"}</td>}
                  <td style={{ padding: "8px 10px", color: C.muted, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.observacao ?? ""}>
                    {item.observacao ?? "—"}
                  </td>
                  <td style={{ padding: "8px 10px", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="kmm-btn" style={{ padding: 6 }} onClick={() => iniciarEdicao(item)}>
                      <Pencil size={13} />
                    </button>
                    <button className="kmm-btn" style={{ padding: 6 }} onClick={() => excluir(item.id)}>
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

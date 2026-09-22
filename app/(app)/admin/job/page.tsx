"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { C } from "@/lib/kmm-theme";

type Execucao = {
  id: string;
  tipo: string;
  iniciadoEm: string;
  finalizadoEm: string | null;
  status: "EM_EXECUCAO" | "SUCESSO" | "ERRO";
  itensCapturados: number | null;
  erro: string | null;
};

const STATUS_UI: Record<Execucao["status"], { label: string; bg: string; fg: string; icon: any }> = {
  SUCESSO: { label: "Sucesso", bg: "#E7F5EC", fg: C.green, icon: CheckCircle2 },
  ERRO: { label: "Erro", bg: "#FBE7E4", fg: C.red, icon: XCircle },
  EM_EXECUCAO: { label: "Em execução", bg: "#FCEFD8", fg: C.amber, icon: Loader2 },
};

export default function JobPage() {
  const [ativo, setAtivo] = useState(true);
  const [carregandoConfig, setCarregandoConfig] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [carregandoExecucoes, setCarregandoExecucoes] = useState(true);
  const [executandoAgora, setExecutandoAgora] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  function carregarConfig() {
    setCarregandoConfig(true);
    fetch("/api/jobs/config", { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setAtivo(j.ativo ?? true))
      .finally(() => setCarregandoConfig(false));
  }

  function carregarExecucoes() {
    setCarregandoExecucoes(true);
    fetch("/api/jobs/execucoes", { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setExecucoes(j.execucoes ?? []))
      .finally(() => setCarregandoExecucoes(false));
  }

  useEffect(() => {
    carregarConfig();
    carregarExecucoes();
  }, []);

  async function alternarAtivo() {
    const novoValor = !ativo;
    setAtivo(novoValor); // otimista
    setSalvandoConfig(true);
    const res = await fetch("/api/jobs/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: novoValor }),
    });
    setSalvandoConfig(false);
    if (!res.ok) {
      setAtivo(!novoValor); // desfaz se falhou
      setMensagem("Não foi possível salvar. Tente novamente.");
    }
  }

  async function executarAgora() {
    setExecutandoAgora(true);
    setMensagem(null);
    try {
      const res = await fetch("/api/jobs/captura", { method: "POST" });
      const j = await res.json();
      if (!res.ok || j.ok === false) {
        setMensagem(`Falha na captura: ${j.erro ?? "erro desconhecido"}`);
      } else {
        const total = (j.resultados ?? []).reduce((s: number, r: any) => s + r.itens, 0);
        setMensagem(`Captura concluída: ${total} itens gravados.`);
      }
    } catch (e: any) {
      setMensagem(`Falha na captura: ${e.message}`);
    } finally {
      setExecutandoAgora(false);
      carregarExecucoes();
    }
  }

  return (
    <div>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>JOB de captura</h1>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 24 }}>
        Captura diária dos Product Backlog Items do Azure DevOps (KMM4/KMM5) para os indicadores.
      </p>

      <div className="kmm-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Agendamento</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
            Todo dia às 08:00 (horário de Brasília) — horário fixo definido no deploy. Para mudar,
            é preciso alterar o <code>vercel.json</code> e fazer um novo deploy.
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: carregandoConfig ? "default" : "pointer", opacity: carregandoConfig ? 0.5 : 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{ativo ? "Ativado" : "Desativado"}</span>
          <input
            type="checkbox"
            checked={ativo}
            disabled={carregandoConfig || salvandoConfig}
            onChange={alternarAtivo}
            style={{ width: 18, height: 18, accentColor: C.orange }}
          />
        </label>
      </div>

      <div className="kmm-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Executar agora</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
            Dispara a captura imediatamente, independente do agendamento (ignora o toggle acima).
          </div>
        </div>
        <button className="kmm-btn primary" onClick={executarAgora} disabled={executandoAgora} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <RefreshCw size={15} className={executandoAgora ? "kmm-spin" : ""} />
          {executandoAgora ? "Executando…" : "Executar agora"}
        </button>
      </div>

      {mensagem && (
        <div className="kmm-card" style={{ marginBottom: 24, color: C.text, fontSize: 13.5 }}>
          {mensagem}
        </div>
      )}

      <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 17, color: C.text, marginBottom: 12 }}>Histórico de execuções</h2>
      {carregandoExecucoes ? (
        <p style={{ color: C.muted }}>Carregando…</p>
      ) : execucoes.length === 0 ? (
        <p style={{ color: C.muted }}>Nenhuma execução registrada ainda.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {execucoes.map((e) => {
            const ui = STATUS_UI[e.status];
            const Icon = ui.icon;
            return (
              <div key={e.id} className="kmm-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: ui.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={17} color={ui.fg} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>
                    {new Date(e.iniciadoEm).toLocaleString("pt-BR")}
                    {e.itensCapturados != null && <span style={{ fontWeight: 500, color: C.muted }}> · {e.itensCapturados} itens</span>}
                  </div>
                  {e.erro && <div style={{ fontSize: 12.5, color: e.status === "ERRO" ? C.red : C.muted, marginTop: 2 }}>{e.erro}</div>}
                </div>
                <span className="kmm-chip" style={{ background: ui.bg, color: ui.fg, borderColor: "transparent" }}>{ui.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

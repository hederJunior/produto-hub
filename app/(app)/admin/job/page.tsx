"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { C } from "@/lib/kmm-theme";
import PageHeader from "@/components/PageHeader";

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

/**
 * Rotinas automáticas da Administração. Cada JOB tem o seu agendamento fixo no vercel.json, o seu liga/desliga
 * (JobConfig, linha própria) e o seu histórico (JobExecucao, por tipo). `job` é o identificador usado nas rotas
 * /api/jobs/config e /api/jobs/execucoes (sem ele = JOB de captura, o primeiro que existiu).
 */
type DefinicaoJob = {
  job: string | null;
  titulo: string;
  agendamento: string;
  descricaoExecutar: string;
  rotaExecutar: string;
  rotuloItens: string;
  mensagemSucesso: (j: any) => string;
  mensagemFalha: string;
};

const JOBS: DefinicaoJob[] = [
  {
    job: null,
    titulo: "JOB de captura",
    agendamento: "Captura diária dos Product Backlog Items do Azure DevOps (KMM4/KMM5) para os indicadores. Todo dia às 08:00 (horário de Brasília).",
    descricaoExecutar: "Dispara a captura imediatamente, independente do agendamento (ignora o liga/desliga).",
    rotaExecutar: "/api/jobs/captura",
    rotuloItens: "itens",
    mensagemSucesso: (j) => `Captura concluída: ${(j.resultados ?? []).reduce((s: number, r: any) => s + r.itens, 0)} itens gravados.`,
    mensagemFalha: "Falha na captura",
  },
  {
    job: "bloqueio-clientes",
    titulo: "JOB de bloqueio de clientes",
    agendamento:
      "Verifica uma vez por dia quais clientes estão Bloqueados para novas demandas (3 demandas em Backlog, ou 3 em Execução, ou 3 em HML com cliente; KMM4 + KMM5; não contam as demandas das esteiras SWAT, Ecossistema e Obrigações Legais e Financeiras nem as do Area Path KMM5 sem esteira) e guarda o resultado para a Gestão de clientes, o Fluxo do PO e o PDF da OPR. Todo dia às 08:30 (horário de Brasília).",
    descricaoExecutar: "Refaz a verificação agora e atualiza o que as telas mostram (ignora o liga/desliga).",
    rotaExecutar: "/api/jobs/bloqueio-clientes",
    rotuloItens: "clientes avaliados",
    mensagemSucesso: (j) =>
      `Verificação concluída: ${j.avaliados} clientes avaliados, ${(j.bloqueados ?? []).length} bloqueado(s)${(j.bloqueados ?? []).length ? ` (${j.bloqueados.join(", ")})` : ""}.`,
    mensagemFalha: "Falha na verificação",
  },
];

export default function JobPage() {
  return (
    <div>
      <PageHeader titulo="JOBs" subtitulo="Rotinas automáticas do Produto Hub: ligue ou desligue, execute na hora e acompanhe o histórico de cada uma." />
      {JOBS.map((def) => (
        <PainelJob key={def.job ?? "captura"} def={def} />
      ))}
    </div>
  );
}

function PainelJob({ def }: { def: DefinicaoJob }) {
  const sufixo = def.job ? `?job=${def.job}` : "";
  const [ativo, setAtivo] = useState(true);
  const [carregandoConfig, setCarregandoConfig] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [carregandoExecucoes, setCarregandoExecucoes] = useState(true);
  const [executandoAgora, setExecutandoAgora] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  function carregarConfig() {
    setCarregandoConfig(true);
    fetch(`/api/jobs/config${sufixo}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setAtivo(j.ativo ?? true))
      .finally(() => setCarregandoConfig(false));
  }

  function carregarExecucoes() {
    setCarregandoExecucoes(true);
    fetch(`/api/jobs/execucoes${sufixo}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setExecucoes(j.execucoes ?? []))
      .finally(() => setCarregandoExecucoes(false));
  }

  useEffect(() => {
    carregarConfig();
    carregarExecucoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function alternarAtivo() {
    const novoValor = !ativo;
    setAtivo(novoValor); // otimista
    setSalvandoConfig(true);
    const res = await fetch(`/api/jobs/config${sufixo}`, {
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
      const res = await fetch(def.rotaExecutar, { method: "POST" });
      const j = await res.json();
      setMensagem(!res.ok || j.ok === false ? `${def.mensagemFalha}: ${j.erro ?? "erro desconhecido"}` : def.mensagemSucesso(j));
    } catch (e: any) {
      setMensagem(`${def.mensagemFalha}: ${e.message}`);
    } finally {
      setExecutandoAgora(false);
      carregarExecucoes();
    }
  }

  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 19, color: C.text, margin: "0 0 12px" }}>{def.titulo}</h2>

      <div className="kmm-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Agendamento</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
            {def.agendamento} Horário fixo definido no deploy: para mudar, é preciso alterar o <code>vercel.json</code> e fazer um novo deploy.
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, cursor: carregandoConfig ? "default" : "pointer", opacity: carregandoConfig ? 0.5 : 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{ativo ? "Ativado" : "Desativado"}</span>
          <input type="checkbox" checked={ativo} disabled={carregandoConfig || salvandoConfig} onChange={alternarAtivo} style={{ width: 18, height: 18, accentColor: C.orange }} />
        </label>
      </div>

      <div className="kmm-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Executar agora</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{def.descricaoExecutar}</div>
        </div>
        <button className="kmm-btn primary" onClick={executarAgora} disabled={executandoAgora} style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <RefreshCw size={15} className={executandoAgora ? "kmm-spin" : ""} />
          {executandoAgora ? "Executando…" : "Executar agora"}
        </button>
      </div>

      {mensagem && (
        <div className="kmm-card" style={{ marginBottom: 16, color: C.text, fontSize: 13.5 }}>
          {mensagem}
        </div>
      )}

      <h3 style={{ fontFamily: "Sora,sans-serif", fontSize: 15, color: C.text, margin: "0 0 10px" }}>Histórico de execuções</h3>
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
                    {e.itensCapturados != null && (
                      <span style={{ fontWeight: 500, color: C.muted }}>
                        {" "}
                        · {e.itensCapturados} {def.rotuloItens}
                      </span>
                    )}
                  </div>
                  {e.erro && <div style={{ fontSize: 12.5, color: e.status === "ERRO" ? C.red : C.muted, marginTop: 2 }}>{e.erro}</div>}
                </div>
                <span className="kmm-chip" style={{ background: ui.bg, color: ui.fg, borderColor: "transparent" }}>
                  {ui.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useProduto } from "@/components/ProdutoContext";
import { C, corDeStatus } from "@/lib/kmm-theme";

type ItemRoadmap = {
  id: number;
  titulo: string;
  produto: string;
  responsavel?: string;
  trimestre: string;
  progresso: number;
  statusPrazo: "No prazo" | "Atenção" | "Atrasado";
};

export default function RoadmapPage() {
  const { produto } = useProduto();
  const [trimestres, setTrimestres] = useState<Record<string, ItemRoadmap[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    const url = produto === "AMBOS" ? "/api/roadmap" : `/api/roadmap?produto=${produto}`;
    fetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => setTrimestres(j.trimestres ?? {}))
      .catch(() => setErro("Não foi possível carregar o roadmap do Azure DevOps."))
      .finally(() => setCarregando(false));
  }, [produto]);

  const nomesTrimestres = Object.keys(trimestres).sort();

  return (
    <div>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, margin: 0, color: C.text }}>Roadmap e entregas</h1>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 24 }}>Planejamento do time de Produto agrupado por trimestre.</p>

      {carregando && <p style={{ color: C.muted }}>Carregando roadmap do Azure DevOps…</p>}
      {erro && (
        <div className="kmm-card" style={{ color: C.red, fontSize: 13 }}>
          {erro} Confira as variáveis AZURE_DEVOPS_* no .env e o Area Path configurado em app/api/roadmap/route.ts.
        </div>
      )}

      {!carregando && !erro && nomesTrimestres.length === 0 && (
        <p style={{ color: C.muted }}>Nenhum Epic/Feature encontrado para o produto selecionado.</p>
      )}

      {nomesTrimestres.map((trimestre) => (
        <div key={trimestre} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>
            {trimestre}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {trimestres[trimestre].map((item) => {
              const cor = corDeStatus(item.statusPrazo);
              return (
                <div key={item.id} className="kmm-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>{item.titulo}</div>
                    <span className="kmm-chip" style={{ background: cor.bg, color: cor.fg, borderColor: "transparent" }}>{item.statusPrazo}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.orange, fontWeight: 600, marginTop: 4 }}>
                    {item.produto}{item.responsavel ? ` · ${item.responsavel}` : ""}
                  </div>
                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 999, background: C.soft, overflow: "hidden" }}>
                      <div style={{ width: `${item.progresso}%`, height: "100%", background: C.orange, borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{item.progresso}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

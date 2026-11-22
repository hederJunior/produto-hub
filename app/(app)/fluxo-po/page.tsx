"use client";

import { useEffect, useState } from "react";
import { CalendarRange, ListTodo } from "lucide-react";
import AbasVisao from "@/components/AbasVisao";
import PageHeader from "@/components/PageHeader";
import FluxoPoUpstream from "@/components/FluxoPoUpstream";
import FluxoPoDownstream from "@/components/FluxoPoDownstream";

type Aba = "upstream" | "downstream";

/**
 * Fluxo do PO (Fase 1): ajuda o PM e o PO a operar o fluxo de trabalho; toda ação feita na tela reflete no PBI do
 * Azure DevOps. Duas abas — Upstream (esteira de requisições de clientes) e Downstream (fase seguinte). Regras e
 * decisões: docs/fluxo-po-decisoes.md.
 */
export default function FluxoPoPage() {
  const [aba, setAba] = useState<Aba>("upstream");

  // A aba escolhida fica guardada na sessão (junto com os filtros do quadro): voltar do detalhe não joga o usuário de volta no Upstream.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem("fluxo-po:aba:v1") === "downstream") setAba("downstream");
    } catch {
      /* sem armazenamento: segue no padrão */
    }
  }, []);
  function escolher(a: Aba) {
    setAba(a);
    try {
      window.sessionStorage.setItem("fluxo-po:aba:v1", a);
    } catch {
      /* idem */
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Fluxo do PO"
        subtitulo="Opere o fluxo de trabalho do PM e do PO. Cada ação feita aqui é gravada no PBI do Azure DevOps."
      />

      <AbasVisao<Aba>
        rotulo="Fluxo"
        valor={aba}
        onChange={escolher}
        opcoes={[
          { valor: "upstream", label: "Upstream", icone: <ListTodo size={15} /> },
          { valor: "downstream", label: "Downstream", icone: <CalendarRange size={15} /> },
        ]}
      />

      <div style={{ marginTop: 18 }}>{aba === "upstream" ? <FluxoPoUpstream /> : <FluxoPoDownstream />}</div>
    </div>
  );
}

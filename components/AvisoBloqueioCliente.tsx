"use client";

import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { PASTEL } from "@/lib/kmm-theme";
import { ROTULO_BLOQUEIO, descreverMotivos, type LinhaBloqueio } from "@/lib/bloqueio-clientes";

/**
 * Clientes "Bloqueados para novas demandas" (regra em lib/bloqueio-clientes.ts, verificada uma vez por dia pelo JOB
 * "bloqueio-clientes"). Este arquivo tem o hook que lê o resultado guardado e os dois avisos que as telas mostram.
 */

type Estado = { bloqueios: LinhaBloqueio[]; verificadoEm: string | null; carregando: boolean };

/** Lê os clientes bloqueados da última verificação (uma chamada por tela). Se não houver dado, a tela segue sem aviso. */
export function useBloqueios(): Estado {
  const [estado, setEstado] = useState<Estado>({ bloqueios: [], verificadoEm: null, carregando: true });
  useEffect(() => {
    let cancelado = false;
    fetch("/api/clientes/bloqueios", { cache: "no-store" })
      .then((res) => res.json())
      .then((j) => !cancelado && setEstado({ bloqueios: j.bloqueios ?? [], verificadoEm: j.verificadoEm ?? null, carregando: false }))
      .catch(() => !cancelado && setEstado({ bloqueios: [], verificadoEm: null, carregando: false }));
    return () => {
      cancelado = true;
    };
  }, []);
  return estado;
}

const dataVerificacao = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Aviso de UM cliente (Gestão de clientes e detalhe do card na etapa 1.1). */
export function AvisoBloqueioCliente({ bloqueio, comCliente }: { bloqueio: LinhaBloqueio; comCliente?: boolean }) {
  return (
    <div role="status" style={{ display: "flex", gap: 11, alignItems: "flex-start", background: PASTEL.red.bg, border: "1px solid #F5C9C4", borderLeft: "4px solid #DD3322", borderRadius: 12, padding: "11px 14px", fontSize: 13, lineHeight: 1.4 }}>
      <Ban size={17} color="#DD3322" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontWeight: 600, color: "#B42318" }}>{comCliente ? `${bloqueio.cliente}: ${ROTULO_BLOQUEIO.toLowerCase()}` : ROTULO_BLOQUEIO}</div>
        <div style={{ color: "#5C3A36", marginTop: 2 }}>{descreverMotivos(bloqueio)}.</div>
        <div style={{ color: "#8A6F6B", fontSize: 11.5, marginTop: 3 }}>Verificado em {dataVerificacao(bloqueio.verificadoEm)}.</div>
      </div>
    </div>
  );
}

/** Faixa do Fluxo do PO: todos os clientes bloqueados hoje (fica abaixo das abas Upstream e Downstream). */
export function FaixaClientesBloqueados({ bloqueios, verificadoEm }: { bloqueios: LinhaBloqueio[]; verificadoEm: string | null }) {
  if (!bloqueios.length) return null;
  return (
    <div role="status" style={{ display: "flex", gap: 11, alignItems: "flex-start", background: PASTEL.red.bg, border: "1px solid #F5C9C4", borderLeft: "4px solid #DD3322", borderRadius: 12, padding: "10px 14px", marginTop: 14, fontSize: 13, lineHeight: 1.4 }}>
      <Ban size={17} color="#DD3322" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "#B42318" }}>
          {bloqueios.length === 1 ? "1 cliente" : `${bloqueios.length} clientes`} {bloqueios.length === 1 ? "bloqueado" : "bloqueados"} para novas demandas
          {verificadoEm ? <span style={{ fontWeight: 400, color: "#8A6F6B", fontSize: 11.5 }}> · verificado em {dataVerificacao(verificadoEm)}</span> : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {bloqueios.map((b) => (
            <span key={b.cliente} title={descreverMotivos(b)} style={{ background: "#FFFFFF", border: "1px solid #F5C9C4", borderRadius: 999, padding: "2px 10px", fontSize: 12, color: "#5C3A36" }}>
              <strong style={{ fontWeight: 600 }}>{b.cliente}</strong> · {descreverMotivos(b)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

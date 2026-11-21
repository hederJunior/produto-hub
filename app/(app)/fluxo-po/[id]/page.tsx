"use client";

import { useParams } from "next/navigation";
import FluxoPoDetalhe from "@/components/FluxoPoDetalhe";

/** Detalhe de um PBI do Fluxo do PO (T16). Aberto pelo botão "Detalhes" do card do quadro. */
export default function FluxoPoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  return <FluxoPoDetalhe id={id} />;
}

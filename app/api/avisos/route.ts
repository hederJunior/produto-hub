import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

type ItemAviso = {
  titulo: string;
  produto: string;
  origem: string;
  data: string;
  severidade: "CRITICO" | "ATENCAO" | "INFORMATIVO";
};

/**
 * Une duas origens num único feed para a tela "Alertas e avisos":
 * 1) AlertaDisparado — histórico de regras de alerta que já dispararam e-mail (ver /api/alerts/check)
 * 2) Informativos de roadmap — calculados ao vivo (não persistidos): entregas com progresso >= 80%
 *    e ainda dentro do prazo, como um aviso de "fase final". Se o Azure DevOps não estiver
 *    configurado ainda, essa parte é simplesmente omitida do feed (sem quebrar a tela).
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const supabase = getServiceClient();

  const { data: disparados } = await supabase
    .from("AlertaDisparado")
    .select("*, AlertaConfig(nome, produto, severidade)")
    .order("disparadoEm", { ascending: false })
    .limit(30);

  const itensDeAlerta: ItemAviso[] = (disparados ?? []).map((d: any) => ({
    titulo: d.AlertaConfig?.nome ?? "Alerta",
    produto: d.AlertaConfig?.produto ?? "—",
    origem: "BI — Aging",
    data: d.disparadoEm,
    severidade: d.AlertaConfig?.severidade ?? "ATENCAO",
  }));

  let itensDeRoadmap: ItemAviso[] = [];
  try {
    const roadmapRes = await fetch(`${origin}/api/roadmap`, { cache: "no-store" });
    const { trimestres } = await roadmapRes.json();
    const todos = Object.values(trimestres ?? {}).flat() as any[];
    itensDeRoadmap = todos
      .filter((i) => i.progresso >= 80 && i.statusPrazo !== "Atrasado")
      .map((i) => ({
        titulo: `Entrega de ${i.titulo} entrou em fase final`,
        produto: i.produto,
        origem: "Roadmap",
        data: new Date().toISOString(),
        severidade: "INFORMATIVO" as const,
      }));
  } catch {
    // Azure DevOps ainda não configurado — feed segue só com os alertas de e-mail já registrados.
  }

  const itens = [...itensDeAlerta, ...itensDeRoadmap].sort((a, b) => (a.data < b.data ? 1 : -1));

  const contagem = { CRITICO: 0, ATENCAO: 0, INFORMATIVO: 0 };
  for (const i of itens) contagem[i.severidade]++;

  return NextResponse.json({ contagem, itens });
}

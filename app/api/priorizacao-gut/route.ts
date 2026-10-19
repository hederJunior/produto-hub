import { NextResponse } from "next/server";
import { getPbisSwat } from "@/lib/devops-client";
import { getServiceClient } from "@/lib/supabase";
import { ehAdmin } from "@/lib/auth-server";
import { AVALIACAO_VAZIA, STATUS_AVALIACAO, type AvaliacaoGut, type StatusAvaliacao } from "@/lib/priorizacao-gut";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// A área SWAT é só do KMM5 (decisão de Heder, 2026-10-19).
const PROJETO_SWAT = "KMM5";

/**
 * Priorização GUT: PBIs em Backlog da área SWAT (Azure DevOps) + as avaliações já gravadas
 * (tabela PriorizacaoGut) + se o usuário pode editar (só administradores).
 * Se a tabela ainda não existe (migration não rodada), a tela abre normalmente, sem avaliações,
 * com `salvamentoIndisponivel` — nunca derruba a leitura dos itens.
 */
export async function GET() {
  try {
    const [{ itens, areas }, podeEditar] = await Promise.all([getPbisSwat(PROJETO_SWAT), ehAdmin()]);
    const avisos: string[] = [];
    if (!areas.length) avisos.push(`Nenhuma área SWAT encontrada no projeto ${PROJETO_SWAT}.`);

    const avaliacoes: Record<number, AvaliacaoGut> = {};
    let salvamentoIndisponivel = false;
    if (itens.length) {
      const { data, error } = await getServiceClient().from("PriorizacaoGut").select("*").in("workItemId", itens.map((i) => i.id));
      if (error) {
        console.error("[priorizacao-gut] falha ao ler PriorizacaoGut:", error);
        salvamentoIndisponivel = true;
        avisos.push("A tabela PriorizacaoGut não está disponível (rode a migration 20261019120000_priorizacao_gut). Notas e justificativas não serão carregadas nem salvas.");
      } else {
        for (const r of data ?? []) {
          avaliacoes[r.workItemId] = {
            gravidade: r.gravidade ?? null,
            urgencia: r.urgencia ?? null,
            tendencia: r.tendencia ?? null,
            justificativa: r.justificativa ?? "",
            acao: r.acao ?? "",
            status: (STATUS_AVALIACAO as readonly string[]).includes(r.status) ? (r.status as StatusAvaliacao) : AVALIACAO_VAZIA.status,
            atualizadoPor: r.atualizadoPor ?? null,
            atualizadoEm: r.atualizadoEm ?? null,
          };
        }
      }
    }
    return NextResponse.json({ itens, avaliacoes, podeEditar: podeEditar && !salvamentoIndisponivel, salvamentoIndisponivel, avisos });
  } catch (err) {
    console.error("[priorizacao-gut] falha:", err);
    return NextResponse.json({ erro: "Não foi possível carregar a Priorização GUT do Azure DevOps.", itens: [], avaliacoes: {}, podeEditar: false, avisos: [] }, { status: 502 });
  }
}

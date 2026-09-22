import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase";
import { DEVOPS_PROJETOS, type Produto } from "@/lib/devops-projetos";
import { fetchPbisParaSnapshot } from "@/lib/devops-client";
import { chaveMes } from "@/lib/demandas-agregacao";

const MS_POR_DIA = 86_400_000;
const TAMANHO_LOTE = 500;

/**
 * Aging de viabilidade (RN do PRD F01.01 + ajuste pedido por Heder em 2026-09-20): hoje - Data
 * Abertura Produto, em dias inteiros, recalculado a cada captura e só para itens com State =
 * "Backlog". Quando Data Abertura Produto é nula, usa Created Date como data base no lugar
 * (em vez de deixar o item de fora do cálculo).
 */
function calcularAgingDias(state: unknown, dataAberturaProduto: unknown, createdDate: unknown): number | null {
  if (state !== "Backlog") return null;
  const baseBruta = dataAberturaProduto ?? createdDate;
  if (!baseBruta) return null;
  const base = new Date(String(baseBruta));
  if (Number.isNaN(base.getTime())) return null;
  return Math.floor((Date.now() - base.getTime()) / MS_POR_DIA);
}

async function inserirEmLotes(supabase: ReturnType<typeof getServiceClient>, tabela: string, linhas: any[]) {
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE);
    const { error } = await supabase.from(tabela).insert(lote);
    if (error) throw new Error(`Falha ao gravar em ${tabela} (lote iniciado em ${i}): ${error.message}`);
  }
}

async function upsertEmLotes(
  supabase: ReturnType<typeof getServiceClient>,
  tabela: string,
  linhas: any[],
  onConflict: string
) {
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE);
    const { error } = await supabase.from(tabela).upsert(lote, { onConflict });
    if (error) throw new Error(`Falha ao gravar em ${tabela} (lote iniciado em ${i}): ${error.message}`);
  }
}

export type ResultadoCaptura = {
  produto: Produto;
  itens: number;
  avisoTruncamento: boolean;
};

/**
 * Executa a captura de snapshot para os produtos configurados (KMM4/KMM5) e grava em 3 tabelas:
 * - DemandaSnapshot: log bruto diário (append-only), mantido como fonte de auditoria/histórico
 *   completo — não é mais usado pelos painéis (ficou lento demais de escanear).
 * - DemandaAtual: upsert (1 linha por item) com o estado mais recente — o que os painéis leem
 *   pra "ATUAL" e pro histórico do painel Fluxo de Demandas.
 * - DemandaMensal: upsert (1 linha por item+mês) — o que os painéis leem pro histórico mensal de
 *   Aging/Backlog de Viabilidade.
 * Ver docs/decisoes-e-conhecimento.md (entrada de 2026-09-20) pro raciocínio completo por trás
 * de ter 2 tabelas de rollup em vez de 1.
 */
export async function executarCaptura(): Promise<ResultadoCaptura[]> {
  const supabase = getServiceClient();
  const resultados: ResultadoCaptura[] = [];
  const mesCorrente = chaveMes(new Date().toISOString());
  const agora = new Date().toISOString();

  for (const produto of Object.keys(DEVOPS_PROJETOS) as Produto[]) {
    const { project, areaPaths } = DEVOPS_PROJETOS[produto];
    const { items, possivelTruncamento } = await fetchPbisParaSnapshot(project, areaPaths);

    if (items.length) {
      const linhasSnapshot: any[] = [];
      const linhasAtual: any[] = [];
      const linhasMensal: any[] = [];

      for (const item of items) {
        const f = item.fields;
        const state = String(f["System.State"] ?? "");
        const dataAberturaProduto = f["Custom.DataAberturaProduto"] ?? null;
        const createdDate = f["System.CreatedDate"] ?? null;
        const closedDate = f["Microsoft.VSTS.Common.ClosedDate"] ?? null;
        const cliente = (f["Custom.Cliente"] as string) ?? null;
        const squad = (f["System.AreaPath"] as string) ?? null;
        const etapa = (f["Custom.Etapa"] as string) ?? null;
        const descricao = (f["System.Title"] as string) ?? null;
        const classificacao = (f["Custom.Classificacao"] as string) ?? null;
        const agingDias = calcularAgingDias(state, dataAberturaProduto, createdDate);

        linhasSnapshot.push({
          id: randomUUID(),
          produto,
          workItemId: item.id,
          cliente,
          squad,
          state,
          dataAberturaProduto,
          createdDate,
          closedDate,
          etapa,
          descricao,
          classificacao,
          agingDias,
          origem: produto,
        });

        linhasAtual.push({
          workItemId: item.id,
          produto,
          cliente,
          squad,
          state,
          etapa,
          descricao,
          classificacao,
          dataAberturaProduto,
          createdDate,
          closedDate,
          agingDias,
          atualizadoEm: agora,
        });

        linhasMensal.push({
          // DemandaMensal.id é @default(uuid()) no schema, mas isso é um recurso só do Prisma
          // Client — como toda escrita em runtime passa pelo client do Supabase (não pelo Prisma
          // Client), não existe default no nível do banco pra essa coluna (mesmo bug sistêmico já
          // corrigido em outros pontos do código em 2026-09-19; faltou aqui na reescrita de
          // 2026-09-20). Nota: como o upsert reenvia todas as colunas no ON CONFLICT, o "id" é
          // regenerado a cada atualização do mesmo item+mês — sem problema, nada referencia
          // DemandaMensal.id por FK hoje.
          id: randomUUID(),
          workItemId: item.id,
          mes: mesCorrente,
          produto,
          cliente,
          squad,
          state,
          agingDias,
          capturadoEm: agora,
        });
      }

      await inserirEmLotes(supabase, "DemandaSnapshot", linhasSnapshot);
      await upsertEmLotes(supabase, "DemandaAtual", linhasAtual, "workItemId");
      await upsertEmLotes(supabase, "DemandaMensal", linhasMensal, "workItemId,mes");
    }

    resultados.push({ produto, itens: items.length, avisoTruncamento: possivelTruncamento });
  }

  return resultados;
}

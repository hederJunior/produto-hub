/**
 * Fluxo do PO — checklist de cada etapa (T10), montagem PURA: junta as definições (`CHECKLIST_POR_ETAPA`, em lib/fluxo-po.ts)
 * com as linhas da tabela `FluxoPoChecklist`. A leitura e a gravação no banco estão em lib/fluxo-po-checklist-servidor.ts.
 */
import { CHECKLIST_POR_ETAPA, type EtapaFluxo } from "./fluxo-po";

/** Linha da tabela FluxoPoChecklist (só o que a montagem usa). */
export type LinhaChecklist = {
  etapa: string;
  itemId: string;
  marcado: boolean;
  marcadoPor: string | null;
  marcadoEm: string | null;
};

export type ItemChecklistEstado = {
  id: string;
  rotulo: string;
  marcado: boolean;
  /** Quem marcou (nome, ou e-mail se o cadastro não tiver nome) e quando (ISO); null se desmarcado. */
  marcadoPor: string | null;
  marcadoEm: string | null;
};

/**
 * Colunas `TIMESTAMP(3)` (sem fuso) voltam do PostgREST sem sufixo ("2026-11-20T23:47:54.857"), mas guardam hora UTC.
 * Sem o "Z" o navegador leria como hora LOCAL e deslocaria o horário; aqui o instante vira ISO com "Z".
 */
export function instanteUtc(valor: string | null | undefined): string | null {
  const s = String(valor ?? "").trim();
  if (!s) return null;
  return /(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : `${s.replace(" ", "T")}Z`;
}

export type ChecklistPbi = Partial<Record<EtapaFluxo, ItemChecklistEstado[]>>;

/**
 * Checklist completo do PBI: TODAS as etapas com checklist, na ordem das definições, cada item com o estado gravado
 * (sem linha = não marcado). Linhas de itens que não existem mais nas definições são ignoradas.
 */
export function montarChecklist(linhas: LinhaChecklist[]): ChecklistPbi {
  const porChave = new Map(linhas.map((l) => [`${l.etapa}|${l.itemId}`, l]));
  const out: ChecklistPbi = {};
  for (const [etapa, itens] of Object.entries(CHECKLIST_POR_ETAPA) as [EtapaFluxo, NonNullable<(typeof CHECKLIST_POR_ETAPA)[EtapaFluxo]>][]) {
    out[etapa] = itens.map((i) => {
      const l = porChave.get(`${etapa}|${i.id}`);
      const marcado = !!l?.marcado;
      return { id: i.id, rotulo: i.rotulo, marcado, marcadoPor: marcado ? (l?.marcadoPor ?? null) : null, marcadoEm: marcado ? instanteUtc(l?.marcadoEm) : null };
    });
  }
  return out;
}

/** "3 de 5" do checklist de uma etapa. */
export function resumoDoChecklist(itens: ItemChecklistEstado[] | undefined): { feitos: number; total: number } {
  const lista = itens ?? [];
  return { feitos: lista.filter((i) => i.marcado).length, total: lista.length };
}

/** Checklist completo = tem itens e TODOS marcados. Sem informação (undefined) ou sem itens = não completo. */
export function checklistCompleto(resumo: { feitos: number; total: number } | null | undefined): boolean {
  return !!resumo && resumo.total > 0 && resumo.feitos === resumo.total;
}

/**
 * Resumo ("feitos de total") do checklist da etapa para vários PBIs de uma vez, a partir das linhas da tabela (PURO): quem não tem linha
 * aparece com 0 feitos. Usado pelo quadro para decidir a tag "Pronto para mover" da coluna 2.1.
 */
export function resumirChecklistPorPbi(ids: number[], etapa: EtapaFluxo, linhas: (LinhaChecklist & { workItemId: number })[]): Record<number, { feitos: number; total: number }> {
  const out: Record<number, { feitos: number; total: number }> = {};
  for (const id of ids) {
    const doPbi = linhas.filter((l) => l.workItemId === id && l.etapa === etapa);
    out[id] = resumoDoChecklist(montarChecklist(doPbi)[etapa]);
  }
  return out;
}

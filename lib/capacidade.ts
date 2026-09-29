/** Extrai (major, minor) de um rótulo tipo "Sprint 8.16". Sem match → null (mesma convenção de
 * parseSprint em lib/devops-client.ts e chaveOrdenacaoSprint em app/(app)/roadmap/page.tsx). */
function parseSprint(label: string): { major: number; minor: number } | null {
  const m = /(\d+)\.(\d+)/.exec(label);
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

/** Exportada (além de usada aqui) pra PainelCapacidade.tsx filtrar o board pela mesma regra da
 * auto-alocação — achado por Heder em 2026-09-29: o board mostrava sprints anteriores à "Sprint
 * inicial" escolhida (ex. Sprint 8.16 aparecendo mesmo com 8.17 selecionada), porque só unia os
 * sprints já alocados sem checar se cada um era >= à sprint inicial. */
export function sprintEhIgualOuPosterior(sprint: string, minima: string): boolean {
  const s = parseSprint(sprint);
  const m = parseSprint(minima);
  if (!s || !m) return false;
  return s.major !== m.major ? s.major > m.major : s.minor >= m.minor;
}

export type TarefaParaCapacidade = {
  id: number;
  titulo: string;
  tipo: string;
  state: string;
  sprint: string;
  areaPath: string;
  spEstimados: number | null;
  responsavel: { nome: string } | null;
};

export type AlocacaoAuto = { nome: string; sprint: string; squad: string };

/**
 * Bootstrap do board de "Planejamento de capacidade" a partir de Task/Bug reais do Azure DevOps
 * (pedido por Heder em 2026-09-29): pra cada dev, em cada sprint (>= sprintInicial) onde ele tem
 * pelo menos 1 item, decide em qual squad (Area Path) alocá-lo — a que teve mais itens dele
 * naquela sprint (critério simples de maioria; em empate, a primeira encontrada).
 *
 * Só considera itens com tipo "Task" ou "Bug" (pedido explícito) e com responsável preenchido —
 * item sem AssignedTo não gera alocação (não há "quem" alocar). `squadsValidas` filtra pra só as
 * Area Paths que o board realmente desenha como coluna (DEVOPS_PROJETOS[produto].areaPaths) —
 * achado ao testar com dados reais de KMM5: alguns itens têm Area Path na raiz do projeto ("KMM5",
 * sem sub-time), que geraria uma alocação "fantasma" (contando em "alocados" mas invisível, já
 * que não existe coluna de squad pra ela no board).
 */
export function agruparAlocacoesPorDevSprint(
  tarefas: TarefaParaCapacidade[],
  sprintInicial: string,
  squadsValidas: string[]
): AlocacaoAuto[] {
  const validas = new Set(squadsValidas);
  const contagem = new Map<string, Map<string, number>>(); // chave "nome|sprint" -> squad -> qtd

  for (const t of tarefas) {
    if (t.tipo !== "Task" && t.tipo !== "Bug") continue;
    if (!t.responsavel?.nome) continue;
    if (!validas.has(t.areaPath)) continue;
    if (!sprintEhIgualOuPosterior(t.sprint, sprintInicial)) continue;

    const chave = `${t.responsavel.nome}|${t.sprint}`;
    const porSquad = contagem.get(chave) ?? new Map<string, number>();
    porSquad.set(t.areaPath, (porSquad.get(t.areaPath) ?? 0) + 1);
    contagem.set(chave, porSquad);
  }

  const resultado: AlocacaoAuto[] = [];
  for (const [chave, porSquad] of contagem) {
    const [nome, sprint] = chave.split("|");
    let squadEscolhida = "";
    let maiorQtd = -1;
    for (const [squad, qtd] of porSquad) {
      if (qtd > maiorQtd) {
        maiorQtd = qtd;
        squadEscolhida = squad;
      }
    }
    resultado.push({ nome, sprint, squad: squadEscolhida });
  }
  return resultado;
}

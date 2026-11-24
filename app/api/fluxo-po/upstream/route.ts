import { NextResponse } from "next/server";
import { getFluxoPoUpstream } from "@/lib/devops-client";
import { getUsuarioAtual } from "@/lib/auth-server";
import { permissaoDoFluxo, projetoSuportado } from "@/lib/fluxo-po";
import { lerResumoChecklistDaEtapa } from "@/lib/fluxo-po-checklist-servidor";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/roadmap/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Quadro do Fluxo do PO (Upstream) — SÓ LEITURA. Query: `?projeto=KMM5` (o fluxo existe só no KMM5; outro projeto
 * volta vazio com aviso) e `?esteira=KMM5\TMS - Dedicada Maroni` (opcional; sempre inclui a raiz KMM5 = etapa 1.1).
 * `podeMovimentar` só orienta a tela; a gravação (tarefa futura) revalida a permissão no servidor.
 */
export async function GET(req: Request) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const url = new URL(req.url);
  const projeto = url.searchParams.get("projeto") ?? "KMM5";
  const permissao = permissaoDoFluxo(usuario.papel, usuario.tipo);
  const podeMover = permissao.pode;
  // Quem está vendo (para o filtro "Meus itens" da tela).
  const eu = { email: usuario.email, nome: usuario.nome };
  if (!projetoSuportado(projeto)) {
    return NextResponse.json({ cards: [], esteiras: [], podeMovimentar: podeMover, permissao, eu, avisos: [`O Fluxo do PO existe só no KMM5 (projeto selecionado: ${projeto}).`] });
  }

  try {
    const dados = await getFluxoPoUpstream(url.searchParams.get("esteira"));
    // Checklist dos cards da 2.1 (a tag "Pronto para mover" dessa coluna só aparece com todos os itens marcados). Se o banco falhar, o quadro
    // continua, sem a tag na 2.1, e avisa.
    let checklistComite: Record<number, { feitos: number; total: number }> = {};
    const avisos = [...(dados.avisos ?? [])];
    try {
      checklistComite = await lerResumoChecklistDaEtapa(dados.cards.filter((c) => c.etapa === "2.1").map((c) => c.pbi.id), "2.1");
    } catch {
      avisos.push("Não foi possível ler o checklist da etapa 2.1: a tag \"Pronto para mover\" não é exibida nessa coluna até a próxima atualização.");
    }
    return NextResponse.json({ ...dados, avisos, checklistComite, podeMovimentar: podeMover, permissao, eu });
  } catch (err) {
    console.error("[fluxo-po/upstream] falha:", err);
    return NextResponse.json({ erro: "Não foi possível carregar o quadro do Azure DevOps.", cards: [], esteiras: [], podeMovimentar: podeMover, permissao, eu, avisos: [] }, { status: 502 });
  }
}

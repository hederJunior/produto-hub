import { NextRequest, NextResponse } from "next/server";
import { alocarTaskEmSprint, ErroAlocacao } from "@/lib/devops-client";
import { ehAdmin } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * ÚNICA rota do app que ESCREVE no Azure DevOps (pedido por Heder em 2026-10-14): muda a Iteration
 * da Task/Bug pra sprint escolhida e atribui ao dev. Restrita a admin; as regras (Backlog, esforço
 * 1–60h, dev com menos de 60h na sprint) são revalidadas em alocarTaskEmSprint.
 */
export async function POST(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const { taskId, sprint, devNome } = (await request.json().catch(() => ({}))) as {
    taskId?: unknown;
    sprint?: unknown;
    devNome?: unknown;
  };
  if (!Number.isInteger(taskId) || typeof sprint !== "string" || !sprint || typeof devNome !== "string" || !devNome) {
    return NextResponse.json({ erro: "taskId, sprint e devNome são obrigatórios." }, { status: 400 });
  }

  try {
    await alocarTaskEmSprint({ taskId: taskId as number, sprint, devNome });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroAlocacao) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("[capacidade/alocar-task] falha:", err);
    const detalhe = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ erro: "Não foi possível atualizar o item no Azure DevOps.", detalhe }, { status: 502 });
  }
}

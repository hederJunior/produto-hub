import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth-server";
import { ErroFluxoPo } from "@/lib/fluxo-po-servidor";
import { lerChecklistPbi, marcarItemChecklist } from "@/lib/fluxo-po-checklist-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function resposta(err: unknown, rotulo: string) {
  if (err instanceof ErroFluxoPo) return NextResponse.json({ erro: err.message, codigo: err.codigo }, { status: err.status });
  console.error(`[fluxo-po/checklist ${rotulo}] falha inesperada:`, err);
  return NextResponse.json({ erro: "Não foi possível processar o checklist." }, { status: 500 });
}

/** Checklist do PBI (todas as etapas, com quem marcou e quando). Qualquer usuário logado vê. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json({ checklist: await lerChecklistPbi(params.id) });
  } catch (err) {
    return resposta(err, "GET");
  }
}

/**
 * Marca ou desmarca um item: corpo `{ etapa, itemId, marcado }`. Só quem pode movimentar o fluxo altera (403 com o motivo);
 * a verificação é refeita aqui no servidor. Grava quem marcou e quando.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  let corpo: { etapa?: unknown; itemId?: unknown; marcado?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await marcarItemChecklist({ id: params.id, etapa: corpo.etapa, itemId: corpo.itemId, marcado: corpo.marcado, usuario: usuario }));
  } catch (err) {
    return resposta(err, "PUT");
  }
}

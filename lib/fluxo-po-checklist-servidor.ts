/**
 * Fluxo do PO — checklist de cada etapa guardado na plataforma (T10, tabela FluxoPoChecklist, Supabase).
 * Todos os usuários logados VEEM; só quem tem permissão ALTERA (verificado aqui, no servidor, em toda gravação).
 */
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase";
import { exigirPermissaoMovimento, ErroFluxoPo, lerPbiFluxoPoAtual, type UsuarioFluxoPo } from "./fluxo-po-servidor";
import { itemDeChecklistValido } from "./fluxo-po";
import { montarChecklist, type ChecklistPbi, type ItemChecklistEstado, type LinhaChecklist } from "./fluxo-po-checklist";

function validarId(id: unknown): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ErroFluxoPo(422, "entrada_invalida", "ID do PBI inválido.");
  return n;
}

/** Checklist de TODAS as etapas do PBI, com quem marcou e quando. */
export async function lerChecklistPbi(idBruto: unknown): Promise<ChecklistPbi> {
  const id = validarId(idBruto);
  const { data, error } = await getServiceClient().from("FluxoPoChecklist").select("etapa, itemId, marcado, marcadoPor, marcadoEm").eq("workItemId", id);
  if (error) {
    console.error("[fluxo-po/checklist] leitura falhou:", error.message);
    throw new ErroFluxoPo(502, "banco", "Não foi possível ler o checklist (banco de dados).");
  }
  return montarChecklist((data ?? []) as LinhaChecklist[]);
}

/**
 * Marca ou desmarca um item. Ordem: permissão (403) → entrada (422: etapa/item que existem) → o PBI é do KMM5 (404/422)
 * → grava quem e quando (desmarcar limpa os dois). Devolve o item já com o novo estado.
 */
export async function marcarItemChecklist(params: {
  id: unknown;
  etapa: unknown;
  itemId: unknown;
  marcado: unknown;
  usuario: UsuarioFluxoPo;
  agora?: Date;
}): Promise<{ etapa: string; item: ItemChecklistEstado }> {
  exigirPermissaoMovimento(params.usuario);
  const id = validarId(params.id);
  const etapa = String(params.etapa ?? "");
  const itemId = String(params.itemId ?? "");
  if (typeof params.marcado !== "boolean") throw new ErroFluxoPo(422, "entrada_invalida", 'O campo "marcado" precisa ser verdadeiro ou falso.');
  if (!itemDeChecklistValido(etapa, itemId)) throw new ErroFluxoPo(422, "entrada_invalida", "Esse item não existe no checklist da etapa informada.");
  await lerPbiFluxoPoAtual(id); // confere que é um PBI do KMM5 (404/422 se não)

  const quando = (params.agora ?? new Date()).toISOString();
  const quem = params.usuario.nome?.trim() || params.usuario.email;
  const campos = {
    marcado: params.marcado,
    marcadoPor: params.marcado ? quem : null,
    marcadoEm: params.marcado ? quando : null,
    atualizadoEm: quando,
  };
  const supabase = getServiceClient();
  const tabela = () => supabase.from("FluxoPoChecklist");

  const atualizar = async () => tabela().update(campos).eq("workItemId", id).eq("etapa", etapa).eq("itemId", itemId);
  const { data: existente, error: erroBusca } = await tabela().select("id").eq("workItemId", id).eq("etapa", etapa).eq("itemId", itemId).maybeSingle();
  let erro = erroBusca;
  if (!erro) {
    if (existente) {
      erro = (await atualizar()).error;
    } else {
      // O @default(uuid()) do Prisma não existe no banco: o id é gerado aqui (ver T09).
      const ins = await tabela().insert({ id: randomUUID(), workItemId: id, etapa, itemId, ...campos });
      // Duas marcações simultâneas do mesmo item: a segunda bate no índice único e vira atualização.
      erro = ins.error?.code === "23505" ? (await atualizar()).error : ins.error;
    }
  }
  if (erro) {
    console.error("[fluxo-po/checklist] gravação falhou:", erro.message);
    throw new ErroFluxoPo(502, "banco", "Não foi possível gravar o checklist (banco de dados). Nada foi alterado.");
  }

  const item = (await lerChecklistPbi(id))[etapa as keyof ChecklistPbi]?.find((i) => i.id === itemId);
  if (!item) throw new ErroFluxoPo(500, "erro", "Não foi possível confirmar o item gravado.");
  return { etapa, item };
}

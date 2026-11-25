/**
 * Lado do servidor da regra "Bloqueado para novas demandas": a verificação diária (JOB) lê os PBIs no Azure, aplica a regra
 * (lib/bloqueio-clientes.ts) e guarda o resultado na tabela ClienteBloqueio; as telas só leem o que está guardado.
 */
import { getServiceClient } from "@/lib/supabase";
import { getPbisGestaoClientes } from "@/lib/devops-client";
import { avaliarBloqueios, type LinhaBloqueio, type MotivoBloqueio } from "@/lib/bloqueio-clientes";

/** O que o JOB devolve (vai para a tela de Administração e para o histórico). */
export type ResultadoVerificacao = { avaliados: number; bloqueados: string[]; verificadoEm: string };

const TABELA = "ClienteBloqueio";

/**
 * Verifica todos os clientes (KMM4 + KMM5) e substitui o que estava guardado. Se o Azure não conseguir consultar algum
 * status, NÃO grava nada e falha: contagem incompleta liberaria cliente bloqueado por engano.
 */
export async function executarVerificacaoBloqueio(): Promise<ResultadoVerificacao> {
  const { itens, avisos } = await getPbisGestaoClientes(["KMM4", "KMM5"]);
  const incompletos = avisos.filter((a) => a.startsWith("Status "));
  if (incompletos.length) throw new Error(`Consulta ao Azure incompleta, nada foi gravado. ${incompletos.join(" ")}`);

  const verificadoEm = new Date().toISOString();
  const avaliacao = avaliarBloqueios(itens);
  const supabase = getServiceClient();

  if (avaliacao.length) {
    const linhas = avaliacao.map((b) => ({ ...b, verificadoEm }));
    const { error } = await supabase.from(TABELA).upsert(linhas, { onConflict: "cliente" });
    if (error) throw new Error(`Falha ao gravar ${TABELA}: ${error.message}`);
  }

  // Cliente que saiu da lista (não tem mais demanda nos 3 status) deixa de ter linha.
  const { data: existentes, error: erroLeitura } = await supabase.from(TABELA).select("cliente");
  if (erroLeitura) throw new Error(`Falha ao ler ${TABELA}: ${erroLeitura.message}`);
  const vigentes = new Set(avaliacao.map((b) => b.cliente));
  const obsoletos = (existentes ?? []).map((l) => l.cliente as string).filter((c) => !vigentes.has(c));
  for (let i = 0; i < obsoletos.length; i += 100) {
    const { error } = await supabase.from(TABELA).delete().in("cliente", obsoletos.slice(i, i + 100));
    if (error) throw new Error(`Falha ao limpar ${TABELA}: ${error.message}`);
  }

  return { avaliados: avaliacao.length, bloqueados: avaliacao.filter((b) => b.bloqueado).map((b) => b.cliente), verificadoEm };
}

/** Clientes bloqueados hoje (o que a última verificação guardou). `indisponivel` = tabela ainda não existe ou erro de leitura. */
export async function lerBloqueados(): Promise<{ bloqueios: LinhaBloqueio[]; verificadoEm: string | null; indisponivel: boolean }> {
  const { data, error } = await getServiceClient().from(TABELA).select("cliente, bloqueado, qtdBacklog, qtdExecucao, qtdHml, motivos, verificadoEm").order("cliente");
  if (error) {
    console.error(`[bloqueio-clientes] não foi possível ler ${TABELA}:`, error.message);
    return { bloqueios: [], verificadoEm: null, indisponivel: true };
  }
  const todas = (data ?? []).map((l) => ({ ...l, motivos: (Array.isArray(l.motivos) ? l.motivos : []) as MotivoBloqueio[], verificadoEm: new Date(l.verificadoEm as string).toISOString() })) as LinhaBloqueio[];
  const verificadoEm = todas.reduce<string | null>((max, l) => (!max || l.verificadoEm > max ? l.verificadoEm : max), null);
  return { bloqueios: todas.filter((l) => l.bloqueado), verificadoEm, indisponivel: false };
}

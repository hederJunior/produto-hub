/**
 * Fluxo do PO > detalhe da etapa 2.1 > "Análise" (pedido por Heder em 2026-11-24): o campo Description do Assesment filho do PBI
 * aparece na tela, pode ser editado e o botão "Registrar Análise" grava o texto de volta no Assesment. Só regras PURAS (sem fetch);
 * a leitura e a gravação no Azure DevOps estão em lib/fluxo-po-analise-servidor.ts.
 *
 * O Description é HTML. O texto é sempre passado pelo sanitizador por lista de permissão (lib/html-seguro.ts) antes de ser mostrado
 * e antes de ser gravado, então o que volta ao Azure tem só tags simples sem atributos: imagens viram "[imagem]" e estilos inline
 * (cor, fonte) se perdem. `analisarPerdas` conta isso no HTML original para a tela avisar ANTES de registrar.
 */
import { sanitizarHtml } from "./html-seguro";
import type { Alteracao } from "./fluxo-po";

/** Tamanho máximo do HTML de uma análise (depois de sanitizado), para o Azure não recusar o salvamento. */
export const LIMITE_ANALISE = 60_000;

export type PerdasAnalise = {
  /** Imagens do HTML original (não são preservadas). */
  imagens: number;
  /** O original tem estilo inline ou fonte (cor, tamanho...), que não é preservado. */
  estilos: boolean;
};

/** O que seria perdido se o texto fosse regravado a partir do que o editor oferece. */
export function analisarPerdas(original: string | null | undefined): PerdasAnalise {
  const html = String(original ?? "");
  return {
    imagens: (html.match(/<img\b/gi) ?? []).length,
    estilos: /<font\b/i.test(html) || /\sstyle\s*=\s*["'][^"']*[^"'\s]/i.test(html),
  };
}

/** HTML sem nenhum texto visível (só tags, espaços e &nbsp;). */
export function htmlSemTexto(html: string): boolean {
  return html.replace(/<[^>]*>|&nbsp;|\s/g, "") === "";
}

/** Valida e limpa o texto que o usuário quer registrar: devolve o HTML seguro a gravar ou a mensagem de erro (422). */
export function prepararAnalise(entrada: unknown): { html: string; erro?: undefined } | { erro: string; html?: undefined } {
  if (typeof entrada !== "string") return { erro: "O texto da análise é obrigatório." };
  const { html, truncado } = sanitizarHtml(entrada, LIMITE_ANALISE);
  if (truncado) return { erro: `A análise passou do tamanho máximo (${LIMITE_ANALISE.toLocaleString("pt-BR")} caracteres). Reduza o texto.` };
  if (htmlSemTexto(html)) return { erro: "Escreva a análise antes de registrar (o campo não pode ficar vazio)." };
  return { html };
}

/** Linha do log: o campo Description do Assesment mudou (guarda só os tamanhos, não o texto inteiro). */
export function alteracaoDaAnalise(assesmentId: number, antes: string, depois: string): Alteracao {
  const tam = (h: string) => `${h.replace(/<[^>]*>/g, "").trim().length} caracteres`;
  return { campo: "System.Description", rotulo: `Análise (Assesment ${assesmentId})`, de: tam(antes), para: tam(depois) };
}

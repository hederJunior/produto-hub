import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import { getServiceClient } from "@/lib/supabase";

/**
 * Espera uma planilha com colunas (nomes flexíveis, case-insensitive):
 * Cliente | Produto | Responsável | Último contato | Situação
 *
 * Situação aceita "Em dia" / "Acompanhar" / "Crítico" (ou já os valores do enum).
 * Produto precisa ser KMM4 ou KMM5.
 */
function normalizarSituacao(valor: string | undefined): "EM_DIA" | "ACOMPANHAR" | "CRITICO" {
  const v = (valor ?? "").trim().toLowerCase();
  if (v.includes("acompanh")) return "ACOMPANHAR";
  if (v.includes("crit") || v.includes("críti")) return "CRITICO";
  return "EM_DIA";
}

function excelDataParaISO(valor: unknown): string | null {
  if (!valor) return null;
  if (typeof valor === "number") {
    // Data serial do Excel
    const data = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(valor) : null;
    if (data) return new Date(Date.UTC(data.y, data.m - 1, data.d)).toISOString();
  }
  const parsed = new Date(String(valor));
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function pegar(linha: Record<string, unknown>, ...chaves: string[]): unknown {
  const entradas = Object.entries(linha);
  for (const chave of chaves) {
    const achado = entradas.find(([k]) => k.trim().toLowerCase() === chave);
    if (achado) return achado[1];
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const arquivo = form.get("arquivo") as File | null;
  if (!arquivo) {
    return NextResponse.json({ erro: "Envie o arquivo no campo 'arquivo' (multipart/form-data)." }, { status: 400 });
  }

  const bytes = await arquivo.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array" });
  const planilha = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilha);

  const registros = linhas
    .map((linha) => {
      const nome = String(pegar(linha, "cliente", "nome") ?? "").trim();
      const produto = String(pegar(linha, "produto") ?? "").trim().toUpperCase();
      const responsavel = pegar(linha, "responsável", "responsavel");
      const situacao = normalizarSituacao(String(pegar(linha, "situação", "situacao") ?? ""));
      const ultimoContato = excelDataParaISO(pegar(linha, "último contato", "ultimo contato"));

      return { id: randomUUID(), nome, produto, responsavel: responsavel ? String(responsavel) : null, situacao, ultimoContato };
    })
    .filter((r) => r.nome && (r.produto === "KMM4" || r.produto === "KMM5"));

  if (!registros.length) {
    return NextResponse.json(
      { erro: "Nenhuma linha válida encontrada. Confira as colunas Cliente e Produto (KMM4/KMM5)." },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();
  const { error } = await supabase.from("Cliente").upsert(registros, { onConflict: "nome,produto" });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, importados: registros.length });
}

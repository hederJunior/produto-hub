import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { ehAdmin } from "@/lib/auth-server";

/** Histórico das últimas execuções do JOB de captura, mais recente primeiro (AC-3). */
export async function GET() {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("JobExecucao")
    .select("id, tipo, iniciadoEm, finalizadoEm, status, itensCapturados, erro")
    .order("iniciadoEm", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ execucoes: data ?? [] });
}

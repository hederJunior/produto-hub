import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase";
import { executarVerificacaoBloqueio } from "@/lib/bloqueio-clientes-servidor";
import { ehAdmin } from "@/lib/auth-server";

// Nunca prerenderizar/cachear estaticamente (mesmo motivo documentado em app/api/jobs/captura/route.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Linha do kill-switch deste JOB em JobConfig (a do JOB de captura é "default"). */
const ID_CONFIG_BLOQUEIO = "bloqueio-clientes";

/**
 * JOB diário "Bloqueio de clientes" (2026-11-24): aplica a regra "Bloqueado para novas demandas" (3 demandas em
 * Backlog, Execução ou HML com cliente — lib/bloqueio-clientes.ts) e guarda o resultado em ClienteBloqueio para as telas.
 *
 * GET: Vercel Cron (vercel.json), protegido por CRON_SECRET; respeita o kill-switch JobConfig.ativo da linha "bloqueio-clientes".
 * POST: botão "Executar agora" da Administração (só admin); ignora o kill-switch, como o JOB de captura.
 * O histórico vai para JobExecucao (tipo "bloqueio-clientes" / "bloqueio-clientes-manual"); `itensCapturados` = clientes avaliados
 * e o texto "N clientes bloqueados: ..." fica em `erro` (mesmo uso informativo que o aviso do JOB de captura).
 */
async function rodar(gatilho: "cron" | "manual") {
  const supabase = getServiceClient();
  const { data: execucao, error: erroInsert } = await supabase
    .from("JobExecucao")
    .insert({ id: randomUUID(), tipo: gatilho === "manual" ? "bloqueio-clientes-manual" : "bloqueio-clientes", status: "EM_EXECUCAO" })
    .select()
    .single();
  if (erroInsert || !execucao) {
    return NextResponse.json({ erro: `Falha ao registrar execução do JOB: ${erroInsert?.message}` }, { status: 500 });
  }

  try {
    const r = await executarVerificacaoBloqueio();
    const resumo = r.bloqueados.length
      ? `${r.bloqueados.length} ${r.bloqueados.length === 1 ? "cliente bloqueado" : "clientes bloqueados"}: ${r.bloqueados.join(", ")}`
      : "Nenhum cliente bloqueado.";
    await supabase
      .from("JobExecucao")
      .update({ status: "SUCESSO", finalizadoEm: new Date().toISOString(), itensCapturados: r.avaliados, erro: resumo })
      .eq("id", execucao.id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    await supabase
      .from("JobExecucao")
      .update({ status: "ERRO", finalizadoEm: new Date().toISOString(), erro: String(e?.message ?? e) })
      .eq("id", execucao.id);
    return NextResponse.json({ ok: false, erro: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const { data: config } = await getServiceClient().from("JobConfig").select("ativo").eq("id", ID_CONFIG_BLOQUEIO).maybeSingle();
  if (config && config.ativo === false) {
    return NextResponse.json({ ok: true, pulado: true, motivo: "JOB desativado (JobConfig.ativo = false)" });
  }
  return rodar("cron");
}

export async function POST() {
  if (!(await ehAdmin())) {
    return NextResponse.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
  }
  return rodar("manual");
}

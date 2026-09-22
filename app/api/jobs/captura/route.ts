import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase";
import { executarCaptura } from "@/lib/job-captura";
import { ehAdmin } from "@/lib/auth-server";

/**
 * JOB de captura diária de PBIs em DemandaSnapshot (REQ01.02/03 do PRD F01.01 - Painel Indicadores).
 *
 * GET: chamado pelo Vercel Cron (ver vercel.json), protegido por CRON_SECRET — mesmo padrão de
 *   app/api/alerts/check. Respeita o kill-switch JobConfig.ativo: se desativado, não executa.
 * POST: botão "Executar agora" da UI de controle do JOB. Protegido pela sessão Supabase exigida
 *   pelo middleware (não usa CRON_SECRET). Ignora o kill-switch de propósito — é um disparo
 *   explícito do usuário.
 */
async function rodar(gatilho: "cron" | "manual") {
  const supabase = getServiceClient();

  const { data: execucao, error: erroInsert } = await supabase
    .from("JobExecucao")
    .insert({
      id: randomUUID(),
      tipo: gatilho === "manual" ? "captura-devops-manual" : "captura-devops",
      status: "EM_EXECUCAO",
    })
    .select()
    .single();

  if (erroInsert || !execucao) {
    return NextResponse.json(
      { erro: `Falha ao registrar execução do JOB: ${erroInsert?.message}` },
      { status: 500 }
    );
  }

  try {
    const resultados = await executarCaptura();
    const totalItens = resultados.reduce((soma, r) => soma + r.itens, 0);
    const produtosComAviso = resultados.filter((r) => r.avisoTruncamento).map((r) => r.produto);

    await supabase
      .from("JobExecucao")
      .update({
        status: "SUCESSO",
        finalizadoEm: new Date().toISOString(),
        itensCapturados: totalItens,
        erro: produtosComAviso.length
          ? `Aviso: WIQL bateu no limite de 20000 itens (resultado pode estar truncado) para: ${produtosComAviso.join(", ")}`
          : null,
      })
      .eq("id", execucao.id);

    return NextResponse.json({ ok: true, resultados });
  } catch (e: any) {
    await supabase
      .from("JobExecucao")
      .update({ status: "ERRO", finalizadoEm: new Date().toISOString(), erro: String(e?.message ?? e) })
      .eq("id", execucao.id);

    return NextResponse.json({ ok: false, erro: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { data: config } = await supabase.from("JobConfig").select("ativo").eq("id", "default").maybeSingle();
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

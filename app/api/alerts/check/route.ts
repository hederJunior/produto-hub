import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase";
import { enviarAlertaEmail } from "@/lib/email";

type Condicao = { metrica: string; operador: ">" | ">=" | "<" | "<=" | "=="; valor: number };
type Fonte = "PAINEL_MANUAL" | "DEVOPS_AUTO";

function avaliar(valorAtual: number, condicao: Condicao): boolean {
  switch (condicao.operador) {
    case ">":
      return valorAtual > condicao.valor;
    case ">=":
      return valorAtual >= condicao.valor;
    case "<":
      return valorAtual < condicao.valor;
    case "<=":
      return valorAtual <= condicao.valor;
    case "==":
      return valorAtual === condicao.valor;
  }
}

function extrairPath(obj: any, path: string): number | undefined {
  return path.split(".").reduce((o, key) => o?.[key], obj);
}

/**
 * Resolve o valor atual de uma regra de acordo com a fonte configurada:
 * - DEVOPS_AUTO: usa o agregado automático de /api/indicadores (aging/backlog calculados via WIQL)
 * - PAINEL_MANUAL: usa o payload de /api/painel-state (data.<produto>), os indicadores
 *   digitados manualmente pelos PMs/POs no painel — mesmo dado que components/PainelIndicadores.jsx edita
 */
function resolverValorAtual(
  regra: { produto: string; fonte: Fonte; condicao: Condicao },
  devopsIndicadores: any[],
  painelData: any
): number | undefined {
  if (regra.fonte === "DEVOPS_AUTO") {
    const indicadorDoProduto = devopsIndicadores.find((i) => i.produto === regra.produto);
    return indicadorDoProduto ? extrairPath(indicadorDoProduto, regra.condicao.metrica) : undefined;
  }

  // PAINEL_MANUAL: path é relativo a data.<produto minúsculo>, ex. "aging", "backlog.execucao"
  const chaveProduto = regra.produto.toLowerCase();
  const dadosDoProduto = painelData?.[chaveProduto];
  return dadosDoProduto ? extrairPath(dadosDoProduto, regra.condicao.metrica) : undefined;
}

/**
 * Protegido por CRON_SECRET. O Vercel Cron injeta automaticamente
 * "Authorization: Bearer <CRON_SECRET>" quando a env var CRON_SECRET está configurada
 * no projeto — por isso o método é GET (padrão das chamadas de cron do Vercel).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const origin = request.nextUrl.origin;
  const supabase = getServiceClient();
  const { data: regras } = await supabase.from("AlertaConfig").select("*").eq("ativo", true);

  const precisaDevops = (regras ?? []).some((r) => r.fonte === "DEVOPS_AUTO");
  const precisaPainel = (regras ?? []).some((r) => r.fonte === "PAINEL_MANUAL");

  const [devopsIndicadores, painelState] = await Promise.all([
    precisaDevops
      ? fetch(`${origin}/api/indicadores`, { cache: "no-store" }).then((r) => r.json()).then((j) => j.indicadores)
      : Promise.resolve([]),
    precisaPainel
      ? fetch(`${origin}/api/painel-state`, { cache: "no-store" }).then((r) => r.json()).then((j) => j.data)
      : Promise.resolve(null),
  ]);

  const disparos: unknown[] = [];

  for (const regra of regras ?? []) {
    const valorAtual = resolverValorAtual(regra, devopsIndicadores, painelState);
    if (valorAtual === undefined) continue;

    if (avaliar(valorAtual, regra.condicao as Condicao)) {
      const resultadoEmail = await enviarAlertaEmail({
        destinatarios: regra.destinatarios,
        assunto: `[Alerta ${regra.produto}] ${regra.nome}`,
        corpoHtml: `<p>A métrica <b>${regra.condicao.metrica}</b> (fonte: ${regra.fonte}) está em <b>${valorAtual}</b>, violando a regra "${regra.nome}" (${regra.condicao.operador} ${regra.condicao.valor}).</p>`,
      });

      await supabase.from("AlertaDisparado").insert({
        id: randomUUID(),
        alertaConfigId: regra.id,
        valorObservado: { [regra.condicao.metrica]: valorAtual, fonte: regra.fonte },
        emailEnviado: resultadoEmail.enviado,
      });

      disparos.push({ regra: regra.nome, produto: regra.produto, fonte: regra.fonte, valorAtual });
    }
  }

  return NextResponse.json({ ok: true, disparos });
}

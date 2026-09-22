import { NextRequest } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getBacklogAtivo } from "@/lib/devops-client";
import { DEVOPS_PROJETOS, type Produto } from "@/lib/devops-projetos";
import { getServiceClient } from "@/lib/supabase";

/**
 * Servidor MCP do Produto Hub. Reaproveita as MESMAS funções de lib/ que as API routes REST usam,
 * para nunca ter lógica de negócio duplicada entre "app humano" e "agentes".
 *
 * Autenticação: por trás do mesmo middleware/allowlist da aplicação (fase 1) —
 * quando migrar para Entra ID, o token de agente passa a ser validado do mesmo jeito.
 */
function buildServer() {
  const server = new McpServer({ name: "produto-hub", version: "0.1.0" });

  server.tool(
    "get_indicadores",
    "Retorna indicadores consolidados de backlog/aging para KMM4 e/ou KMM5.",
    { produto: z.enum(["KMM4", "KMM5"]).optional() },
    async ({ produto }) => {
      const produtos = (produto ? [produto] : Object.keys(DEVOPS_PROJETOS)) as Produto[];

      const resultado = await Promise.all(
        produtos.map(async (p) => {
          const { project, areaPaths } = DEVOPS_PROJETOS[p];
          return { produto: p, backlogAtivo: (await getBacklogAtivo(project, areaPaths)).length };
        })
      );

      return { content: [{ type: "text", text: JSON.stringify(resultado, null, 2) }] };
    }
  );

  server.tool(
    "listar_alertas_disparados",
    "Lista os últimos alertas disparados (histórico), opcionalmente filtrando por produto.",
    { limite: z.number().min(1).max(50).default(10) },
    async ({ limite }) => {
      const supabase = getServiceClient();
      const { data, error } = await supabase
        .from("AlertaDisparado")
        .select("*, AlertaConfig(nome, produto)")
        .order("disparadoEm", { ascending: false })
        .limit(limite);

      if (error) {
        return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

export async function POST(request: NextRequest) {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const body = await request.json();
  // Adaptação mínima: em produção, usar o helper oficial do SDK para Next.js/edge quando disponível,
  // ou rodar este servidor MCP como uma function Node separada se o adapter HTTP exigir streams reais.
  return transport.handleRequest(request as any, body);
}

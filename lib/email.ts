import { Resend } from "resend";

// O client do Resend é criado sob demanda (não no carregamento do módulo).
// Motivo: `new Resend(undefined)` lança "Missing API key" imediatamente, e o passo
// "Collecting page data" do build da Vercel importa este módulo estaticamente — sem essa
// instanciação preguiçosa, o build inteiro quebra sempre que RESEND_API_KEY não está
// configurada, mesmo que nenhuma rota chegue a enviar e-mail de fato.
let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export async function enviarAlertaEmail(params: {
  destinatarios: string[];
  assunto: string;
  corpoHtml: string;
}): Promise<{ enviado: boolean; motivo?: string }> {
  const { destinatarios, assunto, corpoHtml } = params;

  const client = getResendClient();
  if (!client) {
    console.warn(
      `[email] RESEND_API_KEY não configurada — envio ignorado (destinatários: ${destinatarios.join(", ")}, assunto: ${assunto})`
    );
    return { enviado: false, motivo: "RESEND_API_KEY não configurada" };
  }

  await client.emails.send({
    from: process.env.ALERTS_FROM_EMAIL ?? "alertas@produto-hub.nstech.com.br",
    to: destinatarios,
    subject: assunto,
    html: corpoHtml,
  });
  return { enviado: true };
}

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function enviarAlertaEmail(params: {
  destinatarios: string[];
  assunto: string;
  corpoHtml: string;
}) {
  const { destinatarios, assunto, corpoHtml } = params;
  return resend.emails.send({
    from: process.env.ALERTS_FROM_EMAIL ?? "alertas@produto-hub.nstech.com.br",
    to: destinatarios,
    subject: assunto,
    html: corpoHtml,
  });
}

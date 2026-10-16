// Gera um CÓDIGO de acesso (6 dígitos) pra um e-mail liberado, SEM mandar e-mail — pra entregar
// à pessoa por outro canal (Teams/WhatsApp) quando o e-mail de login dela não chega ou o link é
// consumido por scanner (erro otp_expired). A pessoa digita o código na tela de login
// (passo "Digite o código") e entra; vale 1h e uma vez só. Só pra e-mail que JÁ está em AllowedUser.
//
// Uso:
//   node --env-file=.env scripts/gerar-codigo-acesso.mjs fabiana.napoli@nstech.com.br
//
// Roteiro: 1) a pessoa abre a tela de login e pede o acesso com o e-mail dela (isso cria o usuário
// no Supabase Auth, se ainda não existir) e IGNORA o e-mail que chegar; 2) você roda este script
// DEPOIS disso (um novo pedido invalida o código anterior); 3) manda o código pra ela; 4) ela
// digita na tela. Não mande o código por e-mail corporativo com scanner — o código não é "aberto"
// por scanner, mas não precisa expor o código mais do que o necessário.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env antes de rodar este script.");
  process.exit(1);
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Uso: node --env-file=.env scripts/gerar-codigo-acesso.mjs <email>");
  process.exit(1);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: liberado, error: erroBusca } = await supabase.from("AllowedUser").select("email").eq("email", email).maybeSingle();
  if (erroBusca) {
    console.error(`❌ erro ao consultar AllowedUser — ${erroBusca.message}`);
    process.exit(1);
  }
  if (!liberado) {
    console.error(`✗ ${email} NÃO está em AllowedUser — rode adicionar-acesso.mjs antes.`);
    process.exit(1);
  }

  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (error) {
    console.error(`❌ não foi possível gerar o código — ${error.message}`);
    process.exit(1);
  }
  const codigo = data?.properties?.email_otp;
  if (!codigo) {
    console.error("❌ o Supabase não devolveu o código (email_otp). Resposta:", JSON.stringify(data?.properties ?? {}));
    process.exit(1);
  }
  console.log(`✅ Código de acesso para ${email}: ${codigo}`);
  console.log("   Vale por 1 hora e só pode ser usado uma vez. Mande por Teams/WhatsApp; ela digita na tela de login.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

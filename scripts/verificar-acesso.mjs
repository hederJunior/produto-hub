// Confere se um ou mais e-mails estão cadastrados em AllowedUser (Supabase) — só leitura,
// não altera nada. Útil pra diagnosticar "fulano não recebeu o link": o registro na allowlist
// só libera a PASSAGEM no isEmailAllowed() (ver lib/auth-allowlist.ts) — o e-mail com o link
// mágico só é disparado quando a própria pessoa acessa a tela de login e digita o e-mail dela lá
// (POST /api/auth/request-link → supabase.auth.signInWithOtp). Cadastrar em AllowedUser não
// envia e-mail nenhum sozinho.
//
// Uso:
//   node --env-file=.env scripts/verificar-acesso.mjs email1@nstech.com.br email2@nstech.com.br

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env antes de rodar este script.");
  process.exit(1);
}

const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase());
if (!emails.length) {
  console.error("Uso: node --env-file=.env scripts/verificar-acesso.mjs <email1> [email2...]");
  process.exit(1);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const email of emails) {
    const { data, error } = await supabase.from("AllowedUser").select("*").eq("email", email).maybeSingle();
    if (error) {
      console.error(`❌ ${email}: erro ao consultar — ${error.message}`);
      continue;
    }
    if (!data) {
      console.log(`✗ ${email}: NÃO está em AllowedUser — precisa rodar adicionar-acesso.mjs.`);
      continue;
    }
    console.log(`✓ ${email}: cadastrado (tipo "${data.tipo}", id ${data.id}, criado em ${data.criadoEm}).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

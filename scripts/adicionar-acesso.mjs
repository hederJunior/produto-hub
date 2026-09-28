// Libera acesso ao Produto Hub pra um ou mais e-mails, inserindo em AllowedUser (Supabase).
// Esse app usa allowlist por e-mail (login por link mágico, sem senha — ver lib/auth-allowlist.ts):
// só quem está cadastrado aqui consegue entrar.
//
// Uso:
//   node --env-file=.env scripts/adicionar-acesso.mjs email1@nstech.com.br email2@nstech.com.br
//   node --env-file=.env scripts/adicionar-acesso.mjs email@nstech.com.br --tipo=adm
//
// tipo default = "user" (acesso normal, sem a seção Administração). Passe --tipo=adm pra liberar
// também a Administração (JOB de captura, indicadores manuais).
// Já cadastrado? Faz upsert (não duplica, e não derruba nome/papel já preenchidos por engano —
// só atualiza o tipo se você passar --tipo).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env antes de rodar este script.");
  process.exit(1);
}

const args = process.argv.slice(2);
const tipoArg = args.find((a) => a.startsWith("--tipo="));
const tipo = tipoArg ? tipoArg.split("=")[1] : "user";
const emails = args.filter((a) => !a.startsWith("--")).map((e) => e.trim().toLowerCase());

if (!emails.length) {
  console.error("Uso: node --env-file=.env scripts/adicionar-acesso.mjs <email1> [email2...] [--tipo=user|adm]");
  process.exit(1);
}
if (!["user", "adm"].includes(tipo)) {
  console.error(`--tipo inválido: "${tipo}" (use "user" ou "adm")`);
  process.exit(1);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  for (const email of emails) {
    const { data: existente, error: erroBusca } = await supabase.from("AllowedUser").select("*").eq("email", email).maybeSingle();
    if (erroBusca) {
      console.error(`❌ ${email}: erro ao consultar — ${erroBusca.message}`);
      continue;
    }

    if (existente) {
      if (existente.tipo === tipo) {
        console.log(`= ${email} já tem acesso (tipo "${tipo}") — nada a fazer.`);
        continue;
      }
      const { error: erroUpdate } = await supabase.from("AllowedUser").update({ tipo }).eq("email", email);
      if (erroUpdate) {
        console.error(`❌ ${email}: erro ao atualizar tipo — ${erroUpdate.message}`);
      } else {
        console.log(`~ ${email}: tipo atualizado de "${existente.tipo}" para "${tipo}".`);
      }
      continue;
    }

    const { error: erroInsert } = await supabase.from("AllowedUser").insert({ email, tipo });
    if (erroInsert) {
      console.error(`❌ ${email}: erro ao inserir — ${erroInsert.message}`);
    } else {
      console.log(`✅ ${email}: acesso liberado (tipo "${tipo}").`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Libera acesso ao Produto Hub pra um ou mais e-mails, inserindo em AllowedUser (Supabase).
// Esse app usa allowlist por e-mail (login por link mágico, sem senha — ver lib/auth-allowlist.ts):
// só quem está cadastrado aqui consegue entrar.
//
// Uso:
//   node --env-file=.env scripts/adicionar-acesso.mjs email1@nstech.com.br email2@nstech.com.br
//   node --env-file=.env scripts/adicionar-acesso.mjs email@nstech.com.br --tipo=adm
//   node --env-file=.env scripts/adicionar-acesso.mjs email@nstech.com.br --nome="Fulano de Tal" --papel=PO
//
// --nome e --papel (Fluxo do PO, 2026-11-20): o papel define quem MOVIMENTA cards no Fluxo do PO — PM, PO, GPM ou
// Product Ops (ou tipo "adm"); os demais só visualizam. O nome é usado no filtro "Meus itens" e no comentário que o
// sistema publica no PBI, e deve ser parecido com o nome no Azure DevOps. Use UM e-mail por vez com --nome.
//
// tipo default = "user" (acesso normal, sem a seção Administração) só para e-mail NOVO. Passe --tipo=adm pra liberar
// também a Administração (JOB de captura, indicadores manuais).
// Já cadastrado? Faz upsert (não duplica) e só altera o que você passar (--tipo, --nome, --papel); o que não for
// passado fica como está.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env antes de rodar este script.");
  process.exit(1);
}

const args = process.argv.slice(2);
const tipoArg = args.find((a) => a.startsWith("--tipo="));
const tipo = tipoArg ? tipoArg.split("=")[1] : "user";
const nomeArg = args.find((a) => a.startsWith("--nome="));
const papelArg = args.find((a) => a.startsWith("--papel="));
const nome = nomeArg ? nomeArg.slice("--nome=".length).trim() : null;
const papel = papelArg ? papelArg.slice("--papel=".length).trim() : null;
const emails = args.filter((a) => !a.startsWith("--")).map((e) => e.trim().toLowerCase());

if (!emails.length) {
  console.error("Uso: node --env-file=.env scripts/adicionar-acesso.mjs <email1> [email2...] [--tipo=user|adm]");
  process.exit(1);
}
if (nomeArg && emails.length > 1) {
  console.error("--nome vale para um e-mail só: rode uma vez por pessoa.");
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
      // Só muda o que foi pedido (antes, rodar sem --tipo rebaixava um "adm" para "user").
      const mudancas = {};
      if (tipoArg && existente.tipo !== tipo) mudancas.tipo = tipo;
      if (nomeArg && (existente.nome ?? "") !== nome) mudancas.nome = nome || null;
      if (papelArg && (existente.papel ?? "") !== papel) mudancas.papel = papel || null;
      if (!Object.keys(mudancas).length) {
        console.log(`= ${email} já tem acesso (tipo "${existente.tipo}", papel "${existente.papel ?? "—"}", nome "${existente.nome ?? "—"}") — nada a fazer.`);
        continue;
      }
      const { error: erroUpdate } = await supabase.from("AllowedUser").update(mudancas).eq("email", email);
      if (erroUpdate) {
        console.error(`❌ ${email}: erro ao atualizar — ${erroUpdate.message}`);
      } else {
        console.log(`~ ${email}: atualizado ${JSON.stringify(mudancas)}.`);
      }
      continue;
    }

    // A tabela não tem DEFAULT no banco pra "id" (o @default(uuid()) do schema.prisma é aplicado
    // pelo Prisma Client, não pelo Postgres) — inserindo direto via Supabase (sem passar pelo
    // Prisma), o id tem que ser gerado aqui, senão vem NULL e viola o NOT NULL da coluna.
    const { error: erroInsert } = await supabase.from("AllowedUser").insert({ id: randomUUID(), email, tipo, ...(nome ? { nome } : {}), ...(papel ? { papel } : {}) });
    if (erroInsert) {
      console.error(`❌ ${email}: erro ao inserir — ${erroInsert.message}`);
    } else {
      console.log(`✅ ${email}: acesso liberado (tipo "${tipo}"${papel ? `, papel "${papel}"` : ""}${nome ? `, nome "${nome}"` : ""}).`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

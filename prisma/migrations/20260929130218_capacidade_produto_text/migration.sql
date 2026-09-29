-- AlterTable: troca "produto" do enum "Produto" para TEXT (preservando os dados existentes)
-- achado por Heder em 2026-09-29: .eq("produto", "KMM5") via PostgREST devolvia 0 linhas só na
-- function da Vercel em produção (nunca localmente, mesmo projeto Supabase, valor confirmado
-- byte a byte igual a "KMM5"), enquanto uma contagem sem filtro batia certinho — sintoma raro de
-- cast/schema-cache do tipo enum custom via PostgREST. TEXT elimina esse cast por completo.
DROP INDEX IF EXISTS "DevCapacidade_produto_nome_key";
DROP INDEX IF EXISTS "AlocacaoCapacidade_produto_sprint_idx";

ALTER TABLE "DevCapacidade" ALTER COLUMN "produto" TYPE TEXT USING "produto"::TEXT;
ALTER TABLE "AlocacaoCapacidade" ALTER COLUMN "produto" TYPE TEXT USING "produto"::TEXT;

CREATE UNIQUE INDEX "DevCapacidade_produto_nome_key" ON "DevCapacidade"("produto", "nome");
CREATE INDEX "AlocacaoCapacidade_produto_sprint_idx" ON "AlocacaoCapacidade"("produto", "sprint");

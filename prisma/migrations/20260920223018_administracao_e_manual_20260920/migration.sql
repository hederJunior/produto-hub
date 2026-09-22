-- CreateEnum
CREATE TYPE "PainelIndicador" AS ENUM ('FLUXO_DEMANDAS', 'AGGING_VIABILIDADE', 'BACKLOG_VIABILIDADE');

-- AlterTable
ALTER TABLE "AllowedUser" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "IndicadorManual" (
    "id" TEXT NOT NULL,
    "produto" "Produto" NOT NULL,
    "painel" "PainelIndicador" NOT NULL,
    "mes" TEXT NOT NULL,
    "abertas" INTEGER,
    "encerradas" INTEGER,
    "canceladas" INTEGER,
    "agingMedio" DOUBLE PRECISION,
    "backlogQtd" INTEGER,
    "observacao" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicadorManual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndicadorManual_produto_painel_idx" ON "IndicadorManual"("produto", "painel");

-- CreateIndex
CREATE UNIQUE INDEX "IndicadorManual_produto_painel_mes_key" ON "IndicadorManual"("produto", "painel", "mes");

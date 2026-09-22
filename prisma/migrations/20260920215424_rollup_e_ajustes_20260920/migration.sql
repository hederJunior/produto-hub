-- AlterTable
ALTER TABLE "DemandaSnapshot" ADD COLUMN     "classificacao" TEXT,
ADD COLUMN     "descricao" TEXT;

-- CreateTable
CREATE TABLE "DemandaAtual" (
    "workItemId" INTEGER NOT NULL,
    "produto" "Produto" NOT NULL,
    "cliente" TEXT,
    "squad" TEXT,
    "state" TEXT NOT NULL,
    "etapa" TEXT,
    "descricao" TEXT,
    "classificacao" TEXT,
    "dataAberturaProduto" TIMESTAMP(3),
    "createdDate" TIMESTAMP(3) NOT NULL,
    "closedDate" TIMESTAMP(3),
    "agingDias" INTEGER,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandaAtual_pkey" PRIMARY KEY ("workItemId")
);

-- CreateTable
CREATE TABLE "DemandaMensal" (
    "id" TEXT NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "mes" TEXT NOT NULL,
    "produto" "Produto" NOT NULL,
    "cliente" TEXT,
    "squad" TEXT,
    "state" TEXT NOT NULL,
    "agingDias" INTEGER,
    "capturadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandaMensal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiltroPainelIndicadores" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "cliente" TEXT,
    "squads" TEXT[],
    "dataInicio" TEXT,
    "dataFim" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiltroPainelIndicadores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandaAtual_produto_state_idx" ON "DemandaAtual"("produto", "state");

-- CreateIndex
CREATE INDEX "DemandaAtual_produto_cliente_idx" ON "DemandaAtual"("produto", "cliente");

-- CreateIndex
CREATE INDEX "DemandaAtual_produto_squad_idx" ON "DemandaAtual"("produto", "squad");

-- CreateIndex
CREATE INDEX "DemandaMensal_produto_mes_state_idx" ON "DemandaMensal"("produto", "mes", "state");

-- CreateIndex
CREATE UNIQUE INDEX "DemandaMensal_workItemId_mes_key" ON "DemandaMensal"("workItemId", "mes");

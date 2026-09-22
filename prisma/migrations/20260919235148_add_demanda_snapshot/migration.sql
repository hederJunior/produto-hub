-- CreateEnum
CREATE TYPE "StatusJob" AS ENUM ('EM_EXECUCAO', 'SUCESSO', 'ERRO');

-- CreateTable
CREATE TABLE "DemandaSnapshot" (
    "id" TEXT NOT NULL,
    "produto" "Produto" NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "cliente" TEXT,
    "squad" TEXT,
    "state" TEXT NOT NULL,
    "dataAberturaProduto" TIMESTAMP(3),
    "createdDate" TIMESTAMP(3) NOT NULL,
    "closedDate" TIMESTAMP(3),
    "agingDias" INTEGER,
    "capturadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origem" TEXT NOT NULL DEFAULT 'azure-devops-job',

    CONSTRAINT "DemandaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobExecucao" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'captura-devops',
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "status" "StatusJob" NOT NULL DEFAULT 'EM_EXECUCAO',
    "itensCapturados" INTEGER,
    "erro" TEXT,

    CONSTRAINT "JobExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "frequencia" TEXT NOT NULL DEFAULT 'diaria',
    "horario" TEXT NOT NULL DEFAULT '06:00',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandaSnapshot_produto_capturadoEm_idx" ON "DemandaSnapshot"("produto", "capturadoEm");

-- CreateIndex
CREATE INDEX "DemandaSnapshot_workItemId_capturadoEm_idx" ON "DemandaSnapshot"("workItemId", "capturadoEm");

-- CreateIndex
CREATE INDEX "DemandaSnapshot_produto_state_capturadoEm_idx" ON "DemandaSnapshot"("produto", "state", "capturadoEm");

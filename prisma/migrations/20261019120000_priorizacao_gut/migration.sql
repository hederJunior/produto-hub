-- CreateTable
CREATE TABLE "PriorizacaoGut" (
    "workItemId" INTEGER NOT NULL,
    "gravidade" INTEGER,
    "urgencia" INTEGER,
    "tendencia" INTEGER,
    "justificativa" TEXT,
    "acao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pendente de avaliação',
    "atualizadoPor" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriorizacaoGut_pkey" PRIMARY KEY ("workItemId")
);

-- CreateTable
CREATE TABLE "DevCapacidade" (
    "id" TEXT NOT NULL,
    "produto" "Produto" NOT NULL,
    "nome" TEXT NOT NULL,
    "papel" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevCapacidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlocacaoCapacidade" (
    "id" TEXT NOT NULL,
    "devId" TEXT NOT NULL,
    "produto" "Produto" NOT NULL,
    "sprint" TEXT NOT NULL,
    "squad" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlocacaoCapacidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DevCapacidade_produto_nome_key" ON "DevCapacidade"("produto", "nome");

-- CreateIndex
CREATE INDEX "AlocacaoCapacidade_produto_sprint_idx" ON "AlocacaoCapacidade"("produto", "sprint");

-- CreateIndex
CREATE UNIQUE INDEX "AlocacaoCapacidade_devId_sprint_key" ON "AlocacaoCapacidade"("devId", "sprint");

-- AddForeignKey
ALTER TABLE "AlocacaoCapacidade" ADD CONSTRAINT "AlocacaoCapacidade_devId_fkey" FOREIGN KEY ("devId") REFERENCES "DevCapacidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

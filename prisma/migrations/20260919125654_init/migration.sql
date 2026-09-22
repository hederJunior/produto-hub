-- CreateEnum
CREATE TYPE "Produto" AS ENUM ('KMM4', 'KMM5');

-- CreateEnum
CREATE TYPE "FonteAlerta" AS ENUM ('PAINEL_MANUAL', 'DEVOPS_AUTO');

-- CreateEnum
CREATE TYPE "SeveridadeAlerta" AS ENUM ('CRITICO', 'ATENCAO', 'INFORMATIVO');

-- CreateEnum
CREATE TYPE "SituacaoCliente" AS ENUM ('EM_DIA', 'ACOMPANHAR', 'CRITICO');

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "produto" "Produto" NOT NULL,
    "responsavel" TEXT,
    "ultimoContato" TIMESTAMP(3),
    "situacao" "SituacaoCliente" NOT NULL DEFAULT 'EM_DIA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT,
    "papel" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowedUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicadorSnapshot" (
    "id" TEXT NOT NULL,
    "produto" "Produto" NOT NULL,
    "capturadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metricas" JSONB NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'azure-devops',

    CONSTRAINT "IndicadorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaConfig" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "produto" "Produto" NOT NULL,
    "fonte" "FonteAlerta" NOT NULL DEFAULT 'DEVOPS_AUTO',
    "severidade" "SeveridadeAlerta" NOT NULL DEFAULT 'ATENCAO',
    "condicao" JSONB NOT NULL,
    "destinatarios" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PainelEstado" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "data" JSONB NOT NULL,
    "th" JSONB NOT NULL,
    "history" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PainelEstado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaDisparado" (
    "id" TEXT NOT NULL,
    "alertaConfigId" TEXT NOT NULL,
    "disparadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valorObservado" JSONB NOT NULL,
    "emailEnviado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AlertaDisparado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_nome_produto_key" ON "Cliente"("nome", "produto");

-- CreateIndex
CREATE UNIQUE INDEX "AllowedUser_email_key" ON "AllowedUser"("email");

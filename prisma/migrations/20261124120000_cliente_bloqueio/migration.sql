-- Clientes bloqueados para novas demandas (2026-11-24): resultado da verificação diária (JOB), 1 linha por cliente.
-- Escrita à mão (mesmo SQL que o Prisma geraria para o model ClienteBloqueio) — aplicar no Supabase ANTES do primeiro deploy
-- que traz o JOB (sem a tabela, as telas funcionam sem o aviso e o JOB registra erro no histórico).

-- CreateTable
CREATE TABLE "ClienteBloqueio" (
    "cliente" TEXT NOT NULL,
    "bloqueado" BOOLEAN NOT NULL,
    "qtdBacklog" INTEGER NOT NULL,
    "qtdExecucao" INTEGER NOT NULL,
    "qtdHml" INTEGER NOT NULL,
    "motivos" JSONB NOT NULL,
    "verificadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteBloqueio_pkey" PRIMARY KEY ("cliente")
);

-- Segurança: a tabela só é lida/gravada pelo servidor (service role, que ignora RLS). RLS ligado SEM política impede que a
-- chave pública (anon) do Supabase leia ou grave pela API REST.
ALTER TABLE "ClienteBloqueio" ENABLE ROW LEVEL SECURITY;

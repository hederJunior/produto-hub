-- Fluxo do PO (T09, 2026-11-20): checklist por PBI/etapa e log de movimentos.
-- Escrita à mão (mesmo SQL que o Prisma geraria para os models FluxoPoChecklist e FluxoPoMovimento) — aplicar no Supabase.

-- CreateTable
CREATE TABLE "FluxoPoChecklist" (
    "id" TEXT NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "etapa" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "marcado" BOOLEAN NOT NULL DEFAULT false,
    "marcadoPor" TEXT,
    "marcadoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FluxoPoChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FluxoPoMovimento" (
    "id" TEXT NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "origem" TEXT,
    "destino" TEXT NOT NULL,
    "direcao" TEXT,
    "proposta" BOOLEAN NOT NULL DEFAULT false,
    "usuario" TEXT NOT NULL,
    "usuarioNome" TEXT,
    "resultado" TEXT NOT NULL,
    "motivo" TEXT,
    "alteracoes" JSONB,
    "avisos" JSONB,
    "comentarioPublicado" BOOLEAN,
    "comentarioId" INTEGER,
    "comentarioErro" TEXT,
    "assesments" JSONB,
    "revisaoAntes" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FluxoPoMovimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FluxoPoChecklist_workItemId_idx" ON "FluxoPoChecklist"("workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FluxoPoChecklist_workItemId_etapa_itemId_key" ON "FluxoPoChecklist"("workItemId", "etapa", "itemId");

-- CreateIndex
CREATE INDEX "FluxoPoMovimento_workItemId_criadoEm_idx" ON "FluxoPoMovimento"("workItemId", "criadoEm");

-- CreateIndex
CREATE INDEX "FluxoPoMovimento_criadoEm_idx" ON "FluxoPoMovimento"("criadoEm");

-- CreateIndex
CREATE INDEX "FluxoPoMovimento_usuario_idx" ON "FluxoPoMovimento"("usuario");

-- Segurança: as duas tabelas só são lidas/gravadas pelo servidor (service role, que ignora RLS). Ligar o RLS SEM política
-- impede que a chave pública (anon) do Supabase leia ou grave o log e o checklist pela API REST.
ALTER TABLE "FluxoPoChecklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FluxoPoMovimento" ENABLE ROW LEVEL SECURITY;

-- AlterEnum
ALTER TYPE "public"."DecisionAction" ADD VALUE 'evidence_upload';

-- CreateTable
CREATE TABLE "public"."CarrierInvite" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "carrierName" TEXT,
    "carrierPhone" TEXT,
    "carrierEmail" TEXT,
    "createdByUserId" TEXT,

    CONSTRAINT "CarrierInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarrierInvite_jobId_key" ON "public"."CarrierInvite"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierInvite_tokenHash_key" ON "public"."CarrierInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "CarrierInvite_jobId_idx" ON "public"."CarrierInvite"("jobId");

-- CreateIndex
CREATE INDEX "CarrierInvite_tokenHash_idx" ON "public"."CarrierInvite"("tokenHash");

-- AddForeignKey
ALTER TABLE "public"."CarrierInvite" ADD CONSTRAINT "CarrierInvite_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."TransportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CarrierInvite" ADD CONSTRAINT "CarrierInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


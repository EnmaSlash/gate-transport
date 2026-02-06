-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."DecisionAction" ADD VALUE 'redact_evidence';
ALTER TYPE "public"."DecisionAction" ADD VALUE 'retention_cleanup';

-- AlterTable
ALTER TABLE "public"."Evidence" ADD COLUMN     "redactReason" TEXT,
ADD COLUMN     "redactedAt" TIMESTAMP(3),
ADD COLUMN     "redactedBy" TEXT;

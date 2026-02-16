-- AlterEnum
ALTER TYPE "public"."DecisionAction" ADD VALUE 'notification_sent';

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "public"."NotificationOutbox" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'queued',
    "jobId" TEXT NOT NULL,
    "inviteId" TEXT,
    "toPhone" TEXT,
    "toEmail" TEXT,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_createdAt_idx" ON "public"."NotificationOutbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_jobId_idx" ON "public"."NotificationOutbox"("jobId");

-- AddForeignKey
ALTER TABLE "public"."NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."TransportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "public"."CarrierInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;


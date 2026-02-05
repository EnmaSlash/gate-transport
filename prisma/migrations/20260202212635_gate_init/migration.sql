-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'ACCEPTED', 'PICKUP_CONFIRMED', 'DELIVERY_SUBMITTED', 'RELEASABLE', 'RELEASED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ApprovalMode" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "public"."EvidenceType" AS ENUM ('pickup_photo', 'delivery_photo', 'vin_scan', 'pod', 'note');

-- CreateEnum
CREATE TYPE "public"."PaymentRail" AS ENUM ('stripe', 'ach', 'balance');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('held', 'releasable', 'released');

-- CreateEnum
CREATE TYPE "public"."DecisionAction" AS ENUM ('approve', 'dispute', 'release', 'cancel', 'override');

-- CreateTable
CREATE TABLE "public"."Gate" (
    "id" TEXT NOT NULL,
    "requirePickupPhotos" BOOLEAN NOT NULL DEFAULT true,
    "requireDeliveryPhotos" BOOLEAN NOT NULL DEFAULT true,
    "requireVin" BOOLEAN NOT NULL DEFAULT true,
    "requirePod" BOOLEAN NOT NULL DEFAULT false,
    "minPickupPhotos" INTEGER NOT NULL DEFAULT 4,
    "minDeliveryPhotos" INTEGER NOT NULL DEFAULT 4,
    "approvalMode" "public"."ApprovalMode" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TransportJob" (
    "id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "pickupWindowStart" TIMESTAMP(3),
    "pickupWindowEnd" TIMESTAMP(3),
    "deliveryDeadline" TIMESTAMP(3),
    "carrierName" TEXT,
    "carrierEmail" TEXT,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'DRAFT',
    "gateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentHold" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "rail" "public"."PaymentRail" NOT NULL,
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'held',
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Evidence" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "public"."EvidenceType" NOT NULL,
    "fileUrl" TEXT,
    "note" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "submittedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DecisionLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "action" "public"."DecisionAction" NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "evidenceSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentHold_jobId_key" ON "public"."PaymentHold"("jobId");

-- AddForeignKey
ALTER TABLE "public"."TransportJob" ADD CONSTRAINT "TransportJob_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "public"."Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentHold" ADD CONSTRAINT "PaymentHold_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."TransportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Evidence" ADD CONSTRAINT "Evidence_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."TransportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DecisionLog" ADD CONSTRAINT "DecisionLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."TransportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

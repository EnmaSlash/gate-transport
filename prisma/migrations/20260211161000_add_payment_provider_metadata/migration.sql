-- AlterTable
ALTER TABLE "public"."PaymentHold" ADD COLUMN     "provider" TEXT;
ALTER TABLE "public"."PaymentHold" ADD COLUMN     "idempotencyKey" TEXT;


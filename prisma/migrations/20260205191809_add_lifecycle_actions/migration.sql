-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."DecisionAction" ADD VALUE 'evaluate';
ALTER TYPE "public"."DecisionAction" ADD VALUE 'assign';
ALTER TYPE "public"."DecisionAction" ADD VALUE 'accept';
ALTER TYPE "public"."DecisionAction" ADD VALUE 'pickup_confirm';
ALTER TYPE "public"."DecisionAction" ADD VALUE 'delivery_submit';

-- Ensure enum contains vin_photo (safe/no-op if already present)
ALTER TYPE "public"."EvidenceType" ADD VALUE IF NOT EXISTS 'vin_photo';
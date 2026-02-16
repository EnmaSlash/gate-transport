/**
 * Retention cleanup script.
 *
 * Scans Evidence table for non-redacted items with a storageKey older than
 * the retention window for their type, deletes from R2, marks as redacted,
 * and writes a DecisionLog audit entry.
 *
 * Usage:
 *   npx ts-node scripts/cleanupRetention.ts
 *   npx ts-node scripts/cleanupRetention.ts --dry-run
 *   npx ts-node scripts/cleanupRetention.ts --limit=200
 *   npx ts-node scripts/cleanupRetention.ts --dry-run --limit=50
 */

import "dotenv/config";
import { PrismaClient, type DecisionAction } from "@prisma/client";

const prisma = new PrismaClient();

const PHOTO_TYPES = ["pickup_photo", "delivery_photo", "vin_photo"];

function getRetentionDays(evidenceType: string): number {
  if (PHOTO_TYPES.includes(evidenceType)) {
    return Number(process.env.RETENTION_DAYS_PHOTOS) || 30;
  }
  return Number(process.env.RETENTION_DAYS_TEXT) || 90;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit = 500;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--limit=")) {
      const n = parseInt(arg.split("=")[1], 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }

  return { dryRun, limit };
}

async function main() {
  const { dryRun, limit } = parseArgs();

  console.log(`Retention cleanup ${dryRun ? "(DRY RUN)" : ""}`);
  console.log(`  Photo retention: ${getRetentionDays("pickup_photo")} days`);
  console.log(`  Text retention:  ${getRetentionDays("vin_scan")} days`);
  console.log(`  Limit: ${limit}`);
  console.log("");

  // Compute the two cutoff dates
  const photoCutoff = new Date(Date.now() - getRetentionDays("pickup_photo") * 24 * 60 * 60 * 1000);
  const textCutoff = new Date(Date.now() - getRetentionDays("vin_scan") * 24 * 60 * 60 * 1000);

  // Find expired photo evidence
  const expiredPhotos = await prisma.evidence.findMany({
    where: {
      redactedAt: null,
      fileUrl: { not: null },
      type: { in: ["pickup_photo", "delivery_photo", "vin_photo"] as any },
      createdAt: { lt: photoCutoff },
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  // Find expired text evidence (VIN/POD/NOTE with notes)
  const remainingLimit = Math.max(0, limit - expiredPhotos.length);
  const expiredText = remainingLimit > 0
    ? await prisma.evidence.findMany({
        where: {
          redactedAt: null,
          type: { in: ["vin_scan", "pod", "note"] as any },
          createdAt: { lt: textCutoff },
        },
        take: remainingLimit,
        orderBy: { createdAt: "asc" },
      })
    : [];

  const expired = [...expiredPhotos, ...expiredText];

  console.log(`Scanned: found ${expired.length} expired evidence items`);

  if (expired.length === 0) {
    console.log("Nothing to clean up.");
    await prisma.$disconnect();
    return;
  }

  let deleted = 0;
  let redacted = 0;
  let failed = 0;

  for (const ev of expired) {
    const label = `  [${ev.id}] type=${ev.type} job=${ev.jobId}`;

    if (dryRun) {
      console.log(`${label} → WOULD redact${ev.fileUrl ? " + delete from R2" : ""}`);
      continue;
    }

    try {
      // Delete from R2 if it has a storageKey
      if (ev.fileUrl) {
        try {
          // Dynamic import to avoid loading R2 config in dry-run
          const { deleteObject } = await import("../lib/r2");
          await deleteObject({ key: ev.fileUrl });
          deleted++;
        } catch (err: any) {
          console.error(`${label} → R2 delete failed: ${err?.message}`);
          // Still mark as redacted
        }
      }

      // Mark as redacted
      await prisma.evidence.update({
        where: { id: ev.id },
        data: {
          redactedAt: new Date(),
          redactedBy: "system:retention-cleanup",
          redactReason: "retention_expired",
        },
      });

      // Audit log
      await prisma.decisionLog.create({
        data: {
          jobId: ev.jobId,
          action: "retention_cleanup" as DecisionAction,
          actor: "system:retention-cleanup",
          reason: `retention_expired (${ev.type}: ${getRetentionDays(ev.type)} days)`,
          evidenceSnapshot: {
            evidenceId: ev.id,
            evidenceType: ev.type,
            storageKey: ev.fileUrl ?? null,
            createdAt: ev.createdAt.toISOString(),
          } as any,
        },
      });

      redacted++;
      console.log(`${label} → redacted${ev.fileUrl ? " + deleted from R2" : ""}`);
    } catch (err: any) {
      failed++;
      console.error(`${label} → FAILED: ${err?.message}`);
    }
  }

  console.log("");
  console.log("Summary:");
  console.log(`  Scanned:  ${expired.length}`);
  console.log(`  Expired:  ${expired.length}`);
  if (dryRun) {
    console.log("  (dry run — no changes made)");
  } else {
    console.log(`  Deleted from R2: ${deleted}`);
    console.log(`  Redacted:        ${redacted}`);
    console.log(`  Failed:          ${failed}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

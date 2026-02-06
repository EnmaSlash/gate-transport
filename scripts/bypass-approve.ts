import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const jobId = process.argv[2] || "44ef8d1f-c5d5-4c5b-b4ab-4f08ec3b6a01";

async function main() {
  await p.transportJob.update({
    where: { id: jobId },
    data: { status: "RELEASABLE" },
  });
  await p.paymentHold.update({
    where: { jobId },
    data: { status: "releasable" },
  });
  await p.decisionLog.create({
    data: {
      jobId,
      action: "approve",
      actor: "admin:test-bypass",
      reason: "manual test bypass — gate evaluation skipped",
    },
  });
  console.log(`Done: job ${jobId} is now RELEASABLE`);
}

main().finally(() => p.$disconnect());

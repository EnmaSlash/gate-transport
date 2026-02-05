import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const existing = await db.gate.findFirst();
  if (existing) {
    console.log("Gate already exists:", existing.id);
    return;
  }

  const gate = await db.gate.create({
    data: {
      requirePickupPhotos: true,
      requireDeliveryPhotos: true,
      requireVin: true,
      requirePod: false,
      minPickupPhotos: 4,
      minDeliveryPhotos: 4,
      approvalMode: "manual",
    },
  });

  console.log("Created gate:", gate.id);
}

main().finally(() => db.$disconnect());

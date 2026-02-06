import { PrismaClient } from "@prisma/client";
import { generateApiKey, hashApiKey, getKeyPrefix } from "../lib/auth";

const db = new PrismaClient();

async function createUserWithKey(
  email: string,
  name: string,
  role: "admin" | "shipper" | "carrier",
  label: string,
) {
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role },
  });

  const existingKeys = await db.apiKey.findFirst({ where: { userId: user.id } });
  if (existingKeys) {
    console.log(`  ${role} (${email}): already has API key`);
    return;
  }

  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  await db.apiKey.create({
    data: {
      userId: user.id,
      keyHash,
      keyPrefix: getKeyPrefix(rawKey),
      label,
    },
  });

  console.log(`  ${role} (${email}): ${rawKey}`);
}

async function main() {
  // Seed default gate
  const existingGate = await db.gate.findFirst();
  if (existingGate) {
    console.log("Gate already exists:", existingGate.id);
  } else {
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

  // Seed users with API keys
  console.log("\n=== API KEYS (save these, shown once) ===");
  await createUserWithKey("admin@gate-transport.local", "System Admin", "admin", "initial-admin-key");
  await createUserWithKey("shipper@test.local", "Test Shipper", "shipper", "test-shipper-key");
  await createUserWithKey("carrier@test.local", "Test Carrier", "carrier", "test-carrier-key");
  console.log("==========================================\n");
}

main().finally(() => db.$disconnect());

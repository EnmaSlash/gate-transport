import "dotenv/config";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { hashApiKey, getKeyPrefix } from "../lib/auth";

type Args = { email?: string; userId?: string };

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") out.email = argv[i + 1];
    if (a === "--userId") out.userId = argv[i + 1];
  }
  return out;
}

function usageAndExit(message?: string): never {
  if (message) console.error(message);
  console.error("Usage:");
  console.error("  npx ts-node scripts/mint-api-key.ts --email admin@gate-transport.local");
  console.error("  npx ts-node scripts/mint-api-key.ts --userId <id>");
  process.exit(1);
}

function generateRawKey(): string {
  const raw = crypto.randomBytes(32).toString("base64url");
  return `gk_${raw}`;
}

async function main() {
  // Ensure webcrypto exists for hashApiKey() in Node
  if (!globalThis.crypto?.subtle) {
    (globalThis as any).crypto = crypto.webcrypto;
  }

  const args = parseArgs(process.argv.slice(2));
  const email = args.email?.trim();
  const userId = args.userId?.trim();

  if (!email && !userId) usageAndExit("Missing --email or --userId");
  if (email && userId) usageAndExit("Provide only one of --email or --userId");

  const user = await prisma.user.findUnique({
    where: email ? { email } : { id: userId! },
    select: { id: true, email: true },
  });

  if (!user) {
    usageAndExit(email ? `User not found for email: ${email}` : `User not found for id: ${userId}`);
  }

  const rawKey = generateRawKey();
  const keyHash = await hashApiKey(rawKey);

  await prisma.apiKey.create({
    data: {
      userId: user.id,
      keyHash,
      keyPrefix: getKeyPrefix(rawKey),
      label: "dev_minted",
      active: true,
    },
    select: { id: true },
  });

  // Print the RAW key once to stdout (save it now).
  console.log(rawKey);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });


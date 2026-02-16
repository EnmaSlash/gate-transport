import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function envExists(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

function r2ConfigStatus(): { ok: boolean; detail?: string } {
  const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
  const missing = required.filter((k) => !envExists(k));
  if (missing.length === 0) return { ok: true };
  return { ok: false, detail: `Missing env vars: ${missing.join(", ")}` };
}

export async function GET() {
  const paymentProvider = (process.env.PAYMENT_PROVIDER ?? "noop").toLowerCase();
  const simEnabled = (process.env.ENABLE_SIM_EVIDENCE ?? "").toLowerCase() === "true";
  const build = {
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    version: process.env.npm_package_version,
  };

  const r2 = r2ConfigStatus();

  let db: { ok: boolean; detail?: string } = { ok: false, detail: "Not checked" };
  try {
    // Minimal query: doesn't leak data; just proves DB connectivity + schema.
    await prisma.user.findFirst({ select: { id: true } });
    db = { ok: true };
  } catch (e: any) {
    db = { ok: false, detail: e?.message ?? "DB query failed" };
  }

  let outboxQueued = 0;
  try {
    outboxQueued = await prisma.notificationOutbox.count({
      where: { status: "queued" as any },
    });
  } catch {
    // If table missing/migration not applied, keep as 0 without failing endpoint.
    outboxQueued = 0;
  }

  const ok = db.ok && r2.ok;

  return NextResponse.json({
    ok,
    db,
    r2,
    simEvidence: { enabled: simEnabled },
    payment: { provider: paymentProvider },
    outbox: { queued: outboxQueued },
    build,
  });
}


import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    user: { findFirst: vi.fn() },
    notificationOutbox: { count: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));

import { GET as health } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    prismaMocks.prisma.user.findFirst.mockReset();
    prismaMocks.prisma.notificationOutbox.count.mockReset();
  });

  it("returns expected shape and does not leak env vars", async () => {
    process.env.R2_SECRET_ACCESS_KEY = "SUPER_SECRET_VALUE_DO_NOT_LEAK";
    prismaMocks.prisma.user.findFirst.mockResolvedValueOnce({ id: "u1" });
    prismaMocks.prisma.notificationOutbox.count.mockResolvedValueOnce(3);

    const res = await health();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      ok: expect.any(Boolean),
      db: { ok: expect.any(Boolean) },
      r2: { ok: expect.any(Boolean) },
      simEvidence: { enabled: expect.any(Boolean) },
      payment: { provider: expect.any(String) },
      outbox: { queued: 3 },
      build: { nodeEnv: expect.any(String) },
    });
    // Should never include secret *values*.
    expect(JSON.stringify(data)).not.toContain("SUPER_SECRET_VALUE_DO_NOT_LEAK");
  });

  it("never throws: db failure is reported as ok:false", async () => {
    prismaMocks.prisma.user.findFirst.mockRejectedValueOnce(new Error("db down"));
    prismaMocks.prisma.notificationOutbox.count.mockRejectedValueOnce(new Error("no table"));

    const res = await health();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.db.ok).toBe(false);
    expect(typeof data.db.detail).toBe("string");
  });
});


import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    evidence: { findMany: vi.fn() },
  },
  tx: {
    evidence: { create: vi.fn() },
    decisionLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));

const authMocks = vi.hoisted(() => ({
  getAuthFromHeaders: vi.fn(() => null),
  requireAuth: vi.fn(),
  formatActor: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);

const carrierMocks = vi.hoisted(() => ({
  requireCarrierAuth: vi.fn(),
}));

vi.mock("@/lib/authCarrier", () => carrierMocks);

import { POST as simulate } from "@/app/api/jobs/[id]/evidence/simulate/route";

describe("simulated evidence (dev-only)", () => {
  const oldEnv = { ...process.env };

  beforeEach(() => {
    prismaMocks.prisma.$transaction.mockReset();
    prismaMocks.prisma.evidence.findMany.mockReset();
    prismaMocks.tx.evidence.create.mockReset();
    prismaMocks.tx.decisionLog.create.mockReset();
    carrierMocks.requireCarrierAuth.mockReset();

    prismaMocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(prismaMocks.tx));
    prismaMocks.prisma.evidence.findMany.mockResolvedValue([{ type: "pickup_photo" }]);
    carrierMocks.requireCarrierAuth.mockResolvedValue({ jobId: "job1", inviteId: "inv1", actor: "carrier_link", reason: "carrier_invite:inv1" });
  });

  afterEach(() => {
    process.env = { ...oldEnv };
  });

  it("returns 404 when disabled in production without flag", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_SIM_EVIDENCE;

    const res = await simulate(
      new Request("http://example.test/api/jobs/job1/evidence/simulate", {
        method: "POST",
        body: JSON.stringify({ type: "pickup_photo" }),
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(404);
    expect(carrierMocks.requireCarrierAuth).not.toHaveBeenCalled();
    expect(prismaMocks.tx.evidence.create).not.toHaveBeenCalled();
  });

  it("creates Evidence + DecisionLog when enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_SIM_EVIDENCE = "true";

    const res = await simulate(
      new Request("http://example.test/api/jobs/job1/evidence/simulate", {
        method: "POST",
        body: JSON.stringify({ type: "pickup_photo" }),
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(200);
    expect(carrierMocks.requireCarrierAuth).toHaveBeenCalled();
    expect(prismaMocks.tx.evidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: "job1",
          type: "pickup_photo",
          fileUrl: null,
        }),
      }),
    );
    expect(prismaMocks.tx.decisionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "evidence_upload",
          reason: expect.stringContaining("simulated:pickup_photo"),
        }),
      }),
    );

    const data = await res.json();
    expect(data).toMatchObject({
      ok: true,
      jobId: "job1",
      type: "pickup_photo",
      inserted: 1,
      countsByType: { pickup_photo: 1 },
    });
  });
});


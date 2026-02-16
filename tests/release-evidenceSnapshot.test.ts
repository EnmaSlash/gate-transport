import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  tx: {
    transportJob: { findUnique: vi.fn(), updateMany: vi.fn() },
    paymentHold: { findUnique: vi.fn(), update: vi.fn() },
    decisionLog: { create: vi.fn(), findFirst: vi.fn() },
  },
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMocks.prisma,
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(() => ({ userId: "u1", email: "a@b.com", role: "admin", authMethod: "jwt" })),
  formatActor: vi.fn(() => "user:u1:a@b.com"),
}));

vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => ({
    name: "noop",
    release: async ({ holdId, idempotencyKey }: any) => ({
      ok: true,
      provider: "noop",
      providerRef: `noop_${holdId}_TEST`,
      idempotencyKey,
    }),
  }),
}));

import { POST as release } from "@/app/api/jobs/[id]/release/route";

describe("POST /api/jobs/[id]/release evidenceSnapshot", () => {
  beforeEach(() => {
    prismaMocks.tx.transportJob.findUnique.mockReset();
    prismaMocks.tx.transportJob.updateMany.mockReset();
    prismaMocks.tx.paymentHold.findUnique.mockReset();
    prismaMocks.tx.paymentHold.update.mockReset();
    prismaMocks.tx.decisionLog.create.mockReset();
    prismaMocks.tx.decisionLog.findFirst.mockReset();
    prismaMocks.prisma.$transaction.mockReset();

    prismaMocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(prismaMocks.tx));
  });

  it("writes DecisionLog.evidenceSnapshot (reuse latest approval snapshot when present)", async () => {
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({
      id: "job1",
      vin: "1HGCM82633A004352",
      deliveryDeadline: null,
      status: "RELEASABLE",
      gate: {
        requirePickupPhotos: false,
        requireDeliveryPhotos: false,
        requireVin: false,
        requirePod: false,
        minPickupPhotos: 0,
        minDeliveryPhotos: 0,
      },
      evidence: [],
    });
    prismaMocks.tx.paymentHold.findUnique.mockResolvedValueOnce({ id: "h1", status: "releasable", amountCents: 100, rail: "stripe", providerRef: null, provider: null, idempotencyKey: null });
    prismaMocks.tx.decisionLog.findFirst.mockResolvedValueOnce({
      evidenceSnapshot: { code: "PASS", missing: [], counts: { pickup_photo: 0 } },
    });
    prismaMocks.tx.transportJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await release(
      new Request("http://example.test/api/jobs/job1/release", { method: "POST" }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMocks.tx.decisionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "release",
          evidenceSnapshot: expect.objectContaining({
            code: "PASS",
            missing: [],
            counts: { pickup_photo: 0 },
            provider: expect.objectContaining({
              provider: "noop",
              providerRef: "noop_h1_TEST",
            }),
          }),
        }),
      }),
    );
  });

  it("computes evidenceSnapshot from gate evaluation when no prior approval snapshot exists", async () => {
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({
      id: "job2",
      vin: "1HGCM82633A004352",
      deliveryDeadline: null,
      status: "RELEASABLE",
      gate: {
        requirePickupPhotos: false,
        requireDeliveryPhotos: false,
        requireVin: false,
        requirePod: false,
        minPickupPhotos: 0,
        minDeliveryPhotos: 0,
      },
      evidence: [],
    });
    prismaMocks.tx.paymentHold.findUnique.mockResolvedValueOnce({ id: "h2", status: "releasable", amountCents: 100, rail: "stripe", providerRef: null, provider: null, idempotencyKey: null });
    prismaMocks.tx.decisionLog.findFirst.mockResolvedValueOnce(null);
    prismaMocks.tx.transportJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await release(
      new Request("http://example.test/api/jobs/job2/release", { method: "POST" }),
      { params: Promise.resolve({ id: "job2" }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMocks.tx.decisionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "release",
          evidenceSnapshot: expect.objectContaining({
            code: "PASS",
            missing: [],
            counts: expect.any(Object),
          }),
        }),
      }),
    );
  });
});


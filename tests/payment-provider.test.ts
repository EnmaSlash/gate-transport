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

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));

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
      providerRef: `noop_${holdId}_FIXED`,
      idempotencyKey,
    }),
  }),
}));

import { POST as release } from "@/app/api/jobs/[id]/release/route";

describe("payment provider boundary (noop)", () => {
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

  it("release stores providerRef + idempotencyKey and logs provider info", async () => {
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({
      id: "job1",
      vin: "V",
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
    prismaMocks.tx.paymentHold.findUnique.mockResolvedValueOnce({
      id: "hold1",
      status: "releasable",
      amountCents: 12345,
      rail: "stripe",
      providerRef: null,
      provider: null,
      idempotencyKey: null,
    });
    prismaMocks.tx.decisionLog.findFirst.mockResolvedValueOnce(null);
    prismaMocks.tx.transportJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await release(
      new Request("http://example.test/api/jobs/job1/release", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMocks.tx.paymentHold.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "released",
          provider: "noop",
          providerRef: "noop_hold1_FIXED",
          idempotencyKey: "rel_job1_hold1",
        }),
      }),
    );
    expect(prismaMocks.tx.decisionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "release",
          evidenceSnapshot: expect.objectContaining({
            provider: expect.objectContaining({
              provider: "noop",
              providerRef: "noop_hold1_FIXED",
              idempotencyKey: "rel_job1_hold1",
            }),
          }),
        }),
      }),
    );
  });

  it("repeated release returns already:true and does not mutate providerRef", async () => {
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({
      id: "job1",
      vin: "V",
      deliveryDeadline: null,
      status: "RELEASED",
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

    const res = await release(
      new Request("http://example.test/api/jobs/job1/release", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, already: true, status: "RELEASED" });
    expect(prismaMocks.tx.paymentHold.update).not.toHaveBeenCalled();
    expect(prismaMocks.tx.decisionLog.create).not.toHaveBeenCalled();
  });
});


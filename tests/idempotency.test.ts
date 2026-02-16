import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
  },
  tx: {
    transportJob: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    decisionLog: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    gate: {
      findUnique: vi.fn(),
    },
    evidence: {
      findMany: vi.fn(),
    },
    paymentHold: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));

vi.mock("@/lib/auth", () => ({
  getAuthFromHeaders: vi.fn(() => null),
  requireAuth: vi.fn(() => ({ userId: "u1", email: "a@b.com", role: "admin", authMethod: "jwt" })),
  formatActor: vi.fn(() => "user:u1:a@b.com"),
}));

vi.mock("@/lib/authCarrier", () => ({
  requireCarrierAuth: vi.fn(async () => ({ jobId: "job1", inviteId: "inv1", actor: "carrier_link", reason: "carrier_invite:inv1" })),
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

import { POST as accept } from "@/app/api/jobs/[id]/accept/route";
import { POST as pickupConfirm } from "@/app/api/jobs/[id]/pickup-confirm/route";
import { POST as approve } from "@/app/api/jobs/[id]/approve/route";
import { POST as release } from "@/app/api/jobs/[id]/release/route";

describe("transition idempotency + invalid transition shape", () => {
  beforeEach(() => {
    prismaMocks.prisma.$transaction.mockReset();
    prismaMocks.tx.transportJob.findUnique.mockReset();
    prismaMocks.tx.transportJob.updateMany.mockReset();
    prismaMocks.tx.decisionLog.create.mockReset();
    prismaMocks.tx.decisionLog.findFirst.mockReset();
    prismaMocks.tx.gate.findUnique.mockReset();
    prismaMocks.tx.evidence.findMany.mockReset();
    prismaMocks.tx.paymentHold.findUnique.mockReset();
    prismaMocks.tx.paymentHold.update.mockReset();

    prismaMocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(prismaMocks.tx));
  });

  it("accept called twice -> second returns already:true (no duplicate DecisionLog)", async () => {
    // First call: ASSIGNED -> ACCEPTED succeeds
    prismaMocks.tx.transportJob.findUnique
      .mockResolvedValueOnce({ id: "job1", status: "ASSIGNED" }) // initial check
      .mockResolvedValueOnce({ id: "job1", status: "ACCEPTED" }); // final fetch
    prismaMocks.tx.transportJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const r1 = await accept(
      new Request("http://example.test/api/jobs/job1/accept", { method: "POST" }),
      { params: Promise.resolve({ id: "job1" }) },
    );
    expect(r1.status).toBe(200);
    expect(prismaMocks.tx.decisionLog.create).toHaveBeenCalledTimes(1);

    // Second call: already ACCEPTED
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({ id: "job1", status: "ACCEPTED" });
    const r2 = await accept(
      new Request("http://example.test/api/jobs/job1/accept", { method: "POST" }),
      { params: Promise.resolve({ id: "job1" }) },
    );
    expect(r2.status).toBe(200);
    await expect(r2.json()).resolves.toMatchObject({ ok: true, already: true, status: "ACCEPTED" });
    expect(prismaMocks.tx.decisionLog.create).toHaveBeenCalledTimes(1);
  });

  it("pickup-confirm called twice -> second returns already:true", async () => {
    // First call: ACCEPTED -> PICKUP_CONFIRMED passes phase checks
    prismaMocks.tx.transportJob.findUnique
      .mockResolvedValueOnce({ id: "job1", status: "ACCEPTED", gateId: "g1" })
      .mockResolvedValueOnce({ id: "job1", status: "PICKUP_CONFIRMED" });
    prismaMocks.tx.gate.findUnique.mockResolvedValueOnce({ requirePickupPhotos: true, requireVin: true, minPickupPhotos: 1 });
    prismaMocks.tx.evidence.findMany.mockResolvedValueOnce([{ type: "pickup_photo" }, { type: "vin_photo" }]);
    prismaMocks.tx.transportJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const r1 = await pickupConfirm(
      new Request("http://example.test/api/jobs/job1/pickup-confirm", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "job1" }) },
    );
    expect(r1.status).toBe(200);

    // Second call: already PICKUP_CONFIRMED
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({ id: "job1", status: "PICKUP_CONFIRMED", gateId: "g1" });
    const r2 = await pickupConfirm(
      new Request("http://example.test/api/jobs/job1/pickup-confirm", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "job1" }) },
    );
    expect(r2.status).toBe(200);
    await expect(r2.json()).resolves.toMatchObject({ ok: true, already: true, status: "PICKUP_CONFIRMED" });
  });

  it("approve called twice -> second returns already:true", async () => {
    // First approve: DELIVERY_SUBMITTED -> RELEASABLE
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({
      id: "job1",
      status: "DELIVERY_SUBMITTED",
      vin: "V",
      deliveryDeadline: null,
      gate: { requirePickupPhotos: false, requireDeliveryPhotos: false, requireVin: false, requirePod: false, minPickupPhotos: 0, minDeliveryPhotos: 0 },
      evidence: [],
    });
    prismaMocks.tx.paymentHold.findUnique.mockResolvedValueOnce({ status: "held" });
    prismaMocks.tx.transportJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const r1 = await approve(
      new Request("http://example.test/api/jobs/job1/approve", { method: "POST" }),
      { params: Promise.resolve({ id: "job1" }) },
    );
    expect(r1.status).toBe(200);

    // Second approve: already RELEASABLE
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({
      id: "job1",
      status: "RELEASABLE",
      vin: "V",
      deliveryDeadline: null,
      gate: { requirePickupPhotos: false, requireDeliveryPhotos: false, requireVin: false, requirePod: false, minPickupPhotos: 0, minDeliveryPhotos: 0 },
      evidence: [],
    });
    prismaMocks.tx.paymentHold.findUnique.mockResolvedValueOnce({ status: "releasable" });
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({ status: "RELEASABLE" });

    const r2 = await approve(
      new Request("http://example.test/api/jobs/job1/approve", { method: "POST" }),
      { params: Promise.resolve({ id: "job1" }) },
    );
    expect(r2.status).toBe(200);
    await expect(r2.json()).resolves.toMatchObject({ ok: true, already: true, status: "RELEASABLE" });
  });

  it("release called twice -> second returns already:true", async () => {
    // First release: RELEASABLE -> RELEASED
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({
      id: "job1",
      status: "RELEASABLE",
      vin: "V",
      deliveryDeadline: null,
      gate: { requirePickupPhotos: false, requireDeliveryPhotos: false, requireVin: false, requirePod: false, minPickupPhotos: 0, minDeliveryPhotos: 0 },
      evidence: [],
    });
    prismaMocks.tx.paymentHold.findUnique.mockResolvedValueOnce({ id: "h1", status: "releasable", amountCents: 100, rail: "stripe", providerRef: null, provider: null, idempotencyKey: null });
    prismaMocks.tx.transportJob.updateMany.mockResolvedValueOnce({ count: 1 });

    const r1 = await release(
      new Request("http://example.test/api/jobs/job1/release", { method: "POST" }),
      { params: Promise.resolve({ id: "job1" }) },
    );
    expect(r1.status).toBe(200);

    // Second release: already RELEASED
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({
      id: "job1",
      status: "RELEASED",
      vin: "V",
      deliveryDeadline: null,
      gate: { requirePickupPhotos: false, requireDeliveryPhotos: false, requireVin: false, requirePod: false, minPickupPhotos: 0, minDeliveryPhotos: 0 },
      evidence: [],
    });
    const r2 = await release(
      new Request("http://example.test/api/jobs/job1/release", { method: "POST" }),
      { params: Promise.resolve({ id: "job1" }) },
    );
    expect(r2.status).toBe(200);
    await expect(r2.json()).resolves.toMatchObject({ ok: true, already: true, status: "RELEASED" });
  });

  it("invalid transition returns 409 with code INVALID_TRANSITION", async () => {
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({ id: "job1", status: "DRAFT" });

    const r = await accept(
      new Request("http://example.test/api/jobs/job1/accept", { method: "POST" }),
      { params: Promise.resolve({ id: "job1" }) },
    );
    expect(r.status).toBe(409);
    await expect(r.json()).resolves.toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
      from: "DRAFT",
      to: "ACCEPTED",
    });
  });
});


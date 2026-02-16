import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
  },
  tx: {
    transportJob: { findUnique: vi.fn(), updateMany: vi.fn() },
    gate: { findUnique: vi.fn() },
    evidence: { findMany: vi.fn() },
    decisionLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));

vi.mock("@/lib/auth", () => ({
  getAuthFromHeaders: vi.fn(() => null),
  requireAuth: vi.fn(),
  formatActor: vi.fn(),
}));

vi.mock("@/lib/authCarrier", () => ({
  requireCarrierAuth: vi.fn(async () => ({ jobId: "job1", inviteId: "inv1", actor: "carrier_link", reason: "carrier_invite:inv1" })),
}));

import { POST as pickupConfirm } from "@/app/api/jobs/[id]/pickup-confirm/route";
import { POST as deliverySubmit } from "@/app/api/jobs/[id]/delivery-submit/route";

describe("phase enforcement at transition APIs", () => {
  beforeEach(() => {
    prismaMocks.prisma.$transaction.mockReset();
    prismaMocks.tx.transportJob.findUnique.mockReset();
    prismaMocks.tx.transportJob.updateMany.mockReset();
    prismaMocks.tx.gate.findUnique.mockReset();
    prismaMocks.tx.evidence.findMany.mockReset();
    prismaMocks.tx.decisionLog.create.mockReset();

    prismaMocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(prismaMocks.tx));
  });

  it("pickup-confirm rejects when missing vin_photo or pickup photos", async () => {
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({
      id: "job1",
      status: "ACCEPTED",
      gateId: "gate1",
    });
    prismaMocks.tx.gate.findUnique.mockResolvedValueOnce({
      requirePickupPhotos: true,
      requireVin: true,
      minPickupPhotos: 2,
    });
    prismaMocks.tx.evidence.findMany.mockResolvedValueOnce([
      { type: "pickup_photo" }, // only 1 pickup photo
    ]);

    const res = await pickupConfirm(
      new Request("http://example.test/api/jobs/job1/pickup-confirm", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: "MISSING_EVIDENCE",
    });
    expect(prismaMocks.tx.transportJob.updateMany).not.toHaveBeenCalled();
  });

  it("delivery-submit rejects when missing delivery photos (and pod when required)", async () => {
    prismaMocks.tx.transportJob.findUnique.mockResolvedValueOnce({
      id: "job1",
      status: "PICKUP_CONFIRMED",
      gateId: "gate1",
    });
    prismaMocks.tx.gate.findUnique.mockResolvedValueOnce({
      requireDeliveryPhotos: true,
      requireVin: true,
      requirePod: true,
      minDeliveryPhotos: 3,
    });
    prismaMocks.tx.evidence.findMany.mockResolvedValueOnce([
      { type: "delivery_photo" }, // 1/3
      { type: "vin_photo" },      // ok
      // pod missing
    ]);

    const res = await deliverySubmit(
      new Request("http://example.test/api/jobs/job1/delivery-submit", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toMatchObject({ ok: false, code: "MISSING_EVIDENCE" });
    expect(String(data.missing?.join?.(",") ?? "")).toContain("delivery_photo(");
    expect(String(data.missing?.join?.(",") ?? "")).toContain("pod(1 required)");
    expect(prismaMocks.tx.transportJob.updateMany).not.toHaveBeenCalled();
  });

  it("passes when required evidence exists", async () => {
    prismaMocks.tx.transportJob.findUnique
      .mockResolvedValueOnce({
      id: "job1",
      status: "ACCEPTED",
      gateId: "gate1",
    })
      .mockResolvedValueOnce({ id: "job1", status: "PICKUP_CONFIRMED" });
    prismaMocks.tx.transportJob.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMocks.tx.gate.findUnique.mockResolvedValueOnce({
      requirePickupPhotos: true,
      requireVin: true,
      minPickupPhotos: 2,
    });
    prismaMocks.tx.evidence.findMany.mockResolvedValueOnce([
      { type: "pickup_photo" },
      { type: "pickup_photo" },
      { type: "vin_photo" },
    ]);

    const res = await pickupConfirm(
      new Request("http://example.test/api/jobs/job1/pickup-confirm", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMocks.tx.transportJob.updateMany).toHaveBeenCalled();
    expect(prismaMocks.tx.decisionLog.create).toHaveBeenCalled();
  });
});


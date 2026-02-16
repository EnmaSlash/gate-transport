import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    transportJob: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: {
    transportJob: { update: vi.fn() },
    decisionLog: { create: vi.fn() },
    carrierInvite: { upsert: vi.fn() },
    notificationOutbox: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMocks.prisma,
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(() => ({ userId: "u1", email: "a@b.com", role: "shipper", authMethod: "jwt" })),
  formatActor: vi.fn(() => "user:u1:a@b.com"),
}));

vi.mock("@/lib/carrierInvite", () => ({
  generateRawToken: () => "tok",
  hashToken: () => "hash",
  getBaseUrl: () => "http://127.0.0.1:3010",
}));

import { POST as assign } from "@/app/api/jobs/[id]/assign/route";
import { POST as drain } from "@/app/api/admin/outbox/drain/route";

describe("notification outbox", () => {
  beforeEach(() => {
    prismaMocks.prisma.transportJob.findUnique.mockReset();
    prismaMocks.prisma.$transaction.mockReset();
    prismaMocks.tx.transportJob.update.mockReset();
    prismaMocks.tx.decisionLog.create.mockReset();
    prismaMocks.tx.carrierInvite.upsert.mockReset();
    prismaMocks.tx.notificationOutbox.findFirst.mockReset();
    prismaMocks.tx.notificationOutbox.create.mockReset();
    prismaMocks.tx.notificationOutbox.update.mockReset();
    prismaMocks.tx.notificationOutbox.findMany.mockReset();

    prismaMocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(prismaMocks.tx));
  });

  it("assign enqueues SEND_CARRIER_LINK outbox (create when none queued)", async () => {
    prismaMocks.prisma.transportJob.findUnique.mockResolvedValueOnce({ id: "job1", status: "DRAFT" });
    prismaMocks.tx.transportJob.update.mockResolvedValueOnce({ id: "job1" });
    prismaMocks.tx.carrierInvite.upsert.mockResolvedValueOnce({ id: "inv1" });
    prismaMocks.tx.notificationOutbox.findFirst.mockResolvedValueOnce(null);

    const res = await assign(
      new Request("http://example.test/api/jobs/job1/assign", {
        method: "POST",
        body: JSON.stringify({ carrierName: "ACME", carrierEmail: "x@y.com" }),
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMocks.tx.notificationOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "SEND_CARRIER_LINK",
          status: "queued",
          jobId: "job1",
          inviteId: "inv1",
          toEmail: "x@y.com",
          payload: expect.objectContaining({
            jobId: "job1",
            carrierName: "ACME",
            link: "http://127.0.0.1:3010/c/tok",
          }),
        }),
      }),
    );
  });

  it("assign is idempotent for queued outbox: overwrites existing queued record", async () => {
    prismaMocks.prisma.transportJob.findUnique.mockResolvedValueOnce({ id: "job1", status: "DRAFT" });
    prismaMocks.tx.transportJob.update.mockResolvedValueOnce({ id: "job1" });
    prismaMocks.tx.carrierInvite.upsert.mockResolvedValueOnce({ id: "inv2" });
    prismaMocks.tx.notificationOutbox.findFirst.mockResolvedValueOnce({ id: "out1" });

    const res = await assign(
      new Request("http://example.test/api/jobs/job1/assign", {
        method: "POST",
        body: JSON.stringify({ carrierName: "ACME2", carrierEmail: "z@y.com" }),
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMocks.tx.notificationOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "out1" },
        data: expect.objectContaining({
          status: "queued",
          inviteId: "inv2",
        }),
      }),
    );
    expect(prismaMocks.tx.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it("drain marks queued -> sent and writes DecisionLog notification_sent", async () => {
    // Override auth to be admin for drain
    const { requireAuth } = await import("@/lib/auth");
    (requireAuth as any).mockReturnValueOnce({ userId: "u1", email: "a@b.com", role: "admin", authMethod: "jwt" });

    prismaMocks.tx.notificationOutbox.findMany.mockResolvedValueOnce([
      { id: "o1", type: "SEND_CARRIER_LINK", status: "queued", jobId: "job1", inviteId: "inv1", toPhone: null, toEmail: "x@y.com", payload: { link: "L" } },
      { id: "o2", type: "SEND_CARRIER_LINK", status: "queued", jobId: "job2", inviteId: null, toPhone: "+1", toEmail: null, payload: { link: "L2" } },
    ]);

    const res = await drain(
      new Request("http://example.test/api/admin/outbox/drain", { method: "POST", body: JSON.stringify({ limit: 2 }) }),
    );

    expect(res.status).toBe(200);
    expect(prismaMocks.tx.notificationOutbox.update).toHaveBeenCalledTimes(2);
    expect(prismaMocks.tx.decisionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "notification_sent",
          reason: "SEND_CARRIER_LINK",
        }),
      }),
    );
  });
});


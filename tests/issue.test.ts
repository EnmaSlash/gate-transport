import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  prisma: {
    transportJob: { findUnique: vi.fn() },
    evidence: { findMany: vi.fn() },
    $transaction: vi.fn(),
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
  formatActor: vi.fn(() => "user:u1:a@b.com"),
}));
vi.mock("@/lib/auth", () => authMocks);

const carrierMocks = vi.hoisted(() => ({
  requireCarrierAuth: vi.fn(),
}));
vi.mock("@/lib/authCarrier", () => carrierMocks);

import { POST as issue } from "@/app/api/jobs/[id]/issue/route";

describe("carrier issue reporting", () => {
  beforeEach(() => {
    prismaMocks.prisma.transportJob.findUnique.mockReset();
    prismaMocks.prisma.evidence.findMany.mockReset();
    prismaMocks.prisma.$transaction.mockReset();
    prismaMocks.tx.evidence.create.mockReset();
    prismaMocks.tx.decisionLog.create.mockReset();
    carrierMocks.requireCarrierAuth.mockReset();
    (authMocks.getAuthFromHeaders as any).mockReset?.();

    prismaMocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(prismaMocks.tx));
    carrierMocks.requireCarrierAuth.mockResolvedValue({ jobId: "job1", inviteId: "inv1", actor: "carrier_link", reason: "carrier_invite:inv1" });
    prismaMocks.prisma.evidence.findMany.mockResolvedValue([{ type: "note" }]);
  });

  it("carrier token can create issue note evidence", async () => {
    prismaMocks.prisma.transportJob.findUnique.mockResolvedValueOnce({ id: "job1", status: "ACCEPTED" });

    const res = await issue(
      new Request("http://example.test/api/jobs/job1/issue", {
        method: "POST",
        body: JSON.stringify({ message: "Pickup location closed, cannot access." }),
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMocks.tx.evidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: "job1",
          type: "note",
        }),
      }),
    );
    expect(prismaMocks.tx.decisionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "evidence_upload",
          reason: expect.stringContaining("issue_reported"),
        }),
      }),
    );
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      jobId: "job1",
      countsByType: { note: 1 },
    });
  });

  it("validates message length", async () => {
    prismaMocks.prisma.transportJob.findUnique.mockResolvedValueOnce({ id: "job1", status: "ACCEPTED" });

    const res = await issue(
      new Request("http://example.test/api/jobs/job1/issue", {
        method: "POST",
        body: JSON.stringify({ message: "hey" }),
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "BadRequest" });
  });

  it("blocks carrier when job status is not allowed", async () => {
    prismaMocks.prisma.transportJob.findUnique.mockResolvedValueOnce({ id: "job1", status: "RELEASED" });

    const res = await issue(
      new Request("http://example.test/api/jobs/job1/issue", {
        method: "POST",
        body: JSON.stringify({ message: "Something happened." }),
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(409);
    expect(prismaMocks.tx.evidence.create).not.toHaveBeenCalled();
  });
});


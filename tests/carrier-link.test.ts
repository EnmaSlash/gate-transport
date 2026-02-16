import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  carrierInviteFindUnique: vi.fn(),
  carrierInviteUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    carrierInvite: {
      findUnique: prismaMocks.carrierInviteFindUnique,
      update: prismaMocks.carrierInviteUpdate,
    },
  },
}));

import { hashToken, verifyToken } from "@/lib/carrierInvite";
import { requireCarrierAuth } from "@/lib/authCarrier";
import { GET as resolveCarrierLink } from "@/app/api/c/[token]/route";

describe("carrier link tokens", () => {
  beforeEach(() => {
    prismaMocks.carrierInviteFindUnique.mockReset();
    prismaMocks.carrierInviteUpdate.mockReset();
  });

  it("hashToken is deterministic sha256 hex", () => {
    const h1 = hashToken("abc");
    const h2 = hashToken("abc");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifyToken returns invalid when not found", async () => {
    prismaMocks.carrierInviteFindUnique.mockResolvedValueOnce(null);
    const v = await verifyToken("raw");
    expect(v).toEqual({ ok: false, code: "invalid" });
  });

  it("verifyToken blocks revoked and expired invites", async () => {
    prismaMocks.carrierInviteFindUnique.mockResolvedValueOnce({
      id: "i1",
      jobId: "j1",
      revokedAt: new Date(),
      expiresAt: null,
    });
    expect(await verifyToken("raw")).toEqual({ ok: false, code: "revoked" });

    prismaMocks.carrierInviteFindUnique.mockResolvedValueOnce({
      id: "i1",
      jobId: "j1",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(await verifyToken("raw")).toEqual({ ok: false, code: "expired" });
  });

  it("requireCarrierAuth enforces job-scope", async () => {
    prismaMocks.carrierInviteFindUnique.mockResolvedValueOnce({
      id: "invA",
      jobId: "jobA",
      revokedAt: null,
      expiresAt: null,
    });

    const req = new Request("http://example.test/api/jobs/jobB/accept?t=raw");
    const res = await requireCarrierAuth(req, "jobB");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
    await expect((res as Response).json()).resolves.toMatchObject({
      ok: false,
      code: "CARRIER_INVITE_JOB_SCOPE",
    });
  });

  it("GET /api/c/[token] returns 404 for invalid token", async () => {
    prismaMocks.carrierInviteFindUnique.mockResolvedValueOnce(null);
    const res = await resolveCarrierLink(
      new Request("http://example.test/api/c/raw"),
      { params: Promise.resolve({ token: "raw" }) },
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: "CARRIER_INVITE_INVALID",
    });
  });
});


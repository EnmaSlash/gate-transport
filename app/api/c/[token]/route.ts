import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/carrierInvite";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { ok: false, error: "BadRequest", code: "CARRIER_TOKEN_REQUIRED" },
      { status: 400 },
    );
  }

  const tokenHash = hashToken(token);

  const now = new Date();

  const invite = await prisma.carrierInvite.findUnique({
    where: { tokenHash },
    include: {
      job: {
        include: {
          gate: true,
        },
      },
    },
  });

  if (!invite) {
    return NextResponse.json(
      { ok: false, error: "NotFound", code: "CARRIER_INVITE_INVALID" },
      { status: 404 },
    );
  }

  if (invite.revokedAt) {
    return NextResponse.json(
      { ok: false, error: "NotFound", code: "CARRIER_INVITE_REVOKED" },
      { status: 404 },
    );
  }

  if (invite.expiresAt && invite.expiresAt.getTime() < now.getTime()) {
    return NextResponse.json(
      { ok: false, error: "NotFound", code: "CARRIER_INVITE_EXPIRED" },
      { status: 404 },
    );
  }

  await prisma.carrierInvite.update({
    where: { id: invite.id },
    data: {
      lastUsedAt: now,
      useCount: { increment: 1 },
    },
  });

  const job = invite.job;

  return NextResponse.json({
    ok: true,
    invite: {
      id: invite.id,
      jobId: invite.jobId,
      issuedAt: invite.issuedAt,
      expiresAt: invite.expiresAt,
      lastUsedAt: now,
      useCount: invite.useCount + 1,
    },
    job: {
      id: job.id,
      vin: job.vin,
      pickupAddress: job.pickupAddress,
      dropoffAddress: job.dropoffAddress,
      priceCents: job.priceCents,
      status: job.status,
      carrierName: job.carrierName,
      carrierEmail: job.carrierEmail,
    },
    gate: job.gate,
  });
}


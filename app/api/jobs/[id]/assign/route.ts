import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TransportJobStatus, DecisionAction, isValidTransition } from "@/lib/domain";
import { requireAuth, formatActor } from "@/lib/auth";
import { generateRawToken, getBaseUrl, hashToken } from "@/lib/carrierInvite";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "BadRequest", detail: "Missing job id in route param" },
      { status: 400 },
    );
  }

  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const actor = formatActor(auth);

  try {
    const body = await req.json().catch(() => ({}));
    const carrierName = typeof body?.carrierName === "string" ? body.carrierName : undefined;
    const carrierEmail = typeof body?.carrierEmail === "string" ? body.carrierEmail : undefined;
    const carrierPhone = typeof body?.carrierPhone === "string" ? body.carrierPhone : undefined;

    const job = await prisma.transportJob.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!job) {
      return NextResponse.json(
        { ok: false, error: "NotFound", detail: "Job not found" },
        { status: 404 },
      );
    }

    if (!isValidTransition(job.status, TransportJobStatus.ASSIGNED)) {
      return NextResponse.json(
        { ok: false, error: "Conflict", detail: `Cannot assign job in status ${job.status}` },
        { status: 409 },
      );
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const link = `${getBaseUrl()}/c/${rawToken}`;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.transportJob.update({
        where: { id },
        data: {
          status: TransportJobStatus.ASSIGNED,
          ...(carrierName !== undefined && { carrierName }),
          ...(carrierEmail !== undefined && { carrierEmail }),
        },
      });
      await tx.decisionLog.create({
        data: {
          jobId: id,
          action: DecisionAction.ASSIGN as any,
          actor,
          reason: "assignment",
        },
      });

      const invite = await tx.carrierInvite.upsert({
        where: { jobId: id },
        create: {
          jobId: id,
          tokenHash,
          carrierName: carrierName ?? null,
          carrierPhone: carrierPhone ?? null,
          carrierEmail: carrierEmail ?? null,
          createdByUserId: auth.userId,
        },
        update: {
          tokenHash,
          issuedAt: new Date(),
          revokedAt: null,
          lastUsedAt: null,
          useCount: 0,
          carrierName: carrierName ?? null,
          carrierPhone: carrierPhone ?? null,
          carrierEmail: carrierEmail ?? null,
          createdByUserId: auth.userId,
        },
      });

      // Outbox enqueue: keep at most one queued record per (jobId, type)
      const existingQueued = await tx.notificationOutbox.findFirst({
        where: { jobId: id, type: "SEND_CARRIER_LINK", status: "queued" },
        select: { id: true },
      });

      const payload = {
        link,
        jobId: id,
        carrierName: carrierName ?? null,
      };

      if (existingQueued) {
        await tx.notificationOutbox.update({
          where: { id: existingQueued.id },
          data: {
            inviteId: invite.id,
            toPhone: carrierPhone ?? null,
            toEmail: carrierEmail ?? null,
            payload,
            attempts: 0,
            lastError: null,
            createdAt: new Date(),
            sentAt: null,
            status: "queued",
          },
        });
      } else {
        await tx.notificationOutbox.create({
          data: {
            type: "SEND_CARRIER_LINK",
            status: "queued",
            jobId: id,
            inviteId: invite.id,
            toPhone: carrierPhone ?? null,
            toEmail: carrierEmail ?? null,
            payload,
          },
        });
      }

      return result;
    });

    return NextResponse.json({
      ok: true,
      jobId: id,
      job: updated,
      carrierLink: link,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

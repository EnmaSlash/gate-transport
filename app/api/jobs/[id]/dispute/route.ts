import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  TransportJobStatus,
  DecisionAction,
  PaymentHoldStatus,
  isValidTransition,
} from "@/lib/domain";
import { requireAuth, formatActor } from "@/lib/auth";

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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "Body must be valid JSON" },
        { status: 400 },
      );
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "reason is required for disputes" },
        { status: 400 },
      );
    }

    const job = await prisma.transportJob.findUnique({
      where: { id },
      include: { paymentHold: true },
    });

    if (!job) {
      return NextResponse.json(
        { ok: false, error: "NotFound", detail: "Job not found" },
        { status: 404 },
      );
    }

    if (!isValidTransition(job.status, TransportJobStatus.DISPUTED)) {
      return NextResponse.json(
        { ok: false, error: "Conflict", detail: `Cannot dispute job in status ${job.status}` },
        { status: 409 },
      );
    }

    const previousStatus = job.status;
    let warning: string | undefined;

    await prisma.$transaction(async (tx) => {
      await tx.transportJob.update({
        where: { id },
        data: { status: TransportJobStatus.DISPUTED },
      });

      // If payment hold is releasable, freeze it back to held
      if (job.paymentHold?.status === PaymentHoldStatus.RELEASABLE) {
        await tx.paymentHold.update({
          where: { id: job.paymentHold.id },
          data: { status: PaymentHoldStatus.HELD },
        });
      }

      await tx.decisionLog.create({
        data: {
          jobId: id,
          action: DecisionAction.DISPUTE as any,
          actor,
          reason,
        },
      });
    });

    if (job.paymentHold?.status === PaymentHoldStatus.RELEASED) {
      warning = "Payment already released; manual recovery may be required";
    }

    return NextResponse.json({
      ok: true,
      jobId: id,
      previousStatus,
      ...(warning && { warning }),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

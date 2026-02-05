import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  PaymentHoldStatus,
  TransportJobStatus,
  DecisionAction,
  isValidTransition,
} from "@/lib/domain";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await ctx.params;
    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "Missing job id" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const actor = typeof body?.actor === "string" ? body.actor : "unknown";

    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.transportJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });

      if (!job) {
        return {
          status: 404,
          payload: { ok: false, error: "NotFound", detail: "Job not found" },
        };
      }

      if (!isValidTransition(job.status, TransportJobStatus.RELEASED)) {
        return {
          status: 409,
          payload: {
            ok: false,
            error: "Conflict",
            detail: `Cannot release job in status ${job.status}`,
          },
        };
      }

      const hold = await tx.paymentHold.findUnique({
        where: { jobId },
        select: { status: true },
      });

      if (!hold) {
        return {
          status: 404,
          payload: { ok: false, error: "NotFound", detail: "PaymentHold not found" },
        };
      }

      if (hold.status === PaymentHoldStatus.RELEASED) {
        return { status: 200, payload: { ok: true, jobId, alreadyReleased: true } };
      }

      if (hold.status !== PaymentHoldStatus.RELEASABLE) {
        return {
          status: 409,
          payload: {
            ok: false,
            error: "Conflict",
            detail: `PaymentHold not releasable (current: ${hold.status})`,
          },
        };
      }

      await tx.paymentHold.update({
        where: { jobId },
        data: { status: PaymentHoldStatus.RELEASED },
      });

      await tx.transportJob.update({
        where: { id: jobId },
        data: { status: TransportJobStatus.RELEASED },
      });

      await tx.decisionLog.create({
        data: {
          jobId,
          action: DecisionAction.RELEASE,
          actor,
          reason: "manual_release",
        },
      });

      return {
        status: 200,
        payload: { ok: true, jobId },
      };
    });

    return NextResponse.json(result.payload, { status: result.status });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

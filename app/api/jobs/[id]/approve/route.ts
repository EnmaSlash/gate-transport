import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  PaymentHoldStatus,
  TransportJobStatus,
  DecisionAction,
  isValidTransition,
} from "@/lib/domain";
import { runGateEvaluation } from "@/lib/evaluateGate";
import { requireAuth, formatActor } from "@/lib/auth";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const actor = formatActor(auth);

  try {
    const { id: jobId } = await ctx.params;
    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "Missing job id" },
        { status: 400 }
      );
    }

    const job = await prisma.transportJob.findUnique({
      where: { id: jobId },
      include: { gate: true, evidence: true },
    });
    if (!job) {
      return NextResponse.json(
        { ok: false, error: "NotFound", detail: "Job not found" },
        { status: 404 }
      );
    }

    if (!isValidTransition(job.status, TransportJobStatus.RELEASABLE)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Conflict",
          detail: `Cannot approve job in status ${job.status}`,
        },
        { status: 409 }
      );
    }

    const paymentHold = await prisma.paymentHold.findUnique({
      where: { jobId },
    });
    if (!paymentHold) {
      return NextResponse.json(
        { ok: false, error: "NotFound", detail: "PaymentHold not found" },
        { status: 404 }
      );
    }

    if (paymentHold.status === PaymentHoldStatus.RELEASABLE) {
      return NextResponse.json(
        { ok: true, jobId, alreadyApproved: true },
        { status: 200 }
      );
    }

    if (paymentHold.status !== PaymentHoldStatus.HELD) {
      return NextResponse.json(
        {
          ok: false,
          error: "Conflict",
          detail: `Cannot approve from status ${paymentHold.status}`,
        },
        { status: 409 }
      );
    }

    const gate = job.gate;
    const evidence = job.evidence ?? [];
    const evaluation = runGateEvaluation(
      { vin: job.vin, deliveryDeadline: job.deliveryDeadline },
      {
        requirePickupPhotos: gate.requirePickupPhotos,
        requireDeliveryPhotos: gate.requireDeliveryPhotos,
        requireVin: gate.requireVin,
        requirePod: gate.requirePod,
        minPickupPhotos: gate.minPickupPhotos ?? 0,
        minDeliveryPhotos: gate.minDeliveryPhotos ?? 0,
      },
      evidence.map((e) => ({ type: e.type, note: e.note }))
    );

    if (!evaluation.pass) {
      return NextResponse.json(
        {
          ok: false,
          error: "Blocked",
          code: evaluation.code,
          missing: evaluation.missing,
        },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentHold.update({
        where: { jobId },
        data: { status: PaymentHoldStatus.RELEASABLE },
      });

      await tx.transportJob.update({
        where: { id: jobId },
        data: { status: TransportJobStatus.RELEASABLE },
      });

      await tx.decisionLog.create({
        data: {
          jobId,
          action: DecisionAction.APPROVE,
          actor,
          reason: "manual_approval",
          evidenceSnapshot: {
            code: evaluation.code,
            missing: evaluation.missing,
            counts: evaluation.counts,
          },
        },
      });
    });

    return NextResponse.json({ ok: true, jobId }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: "ServerError",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

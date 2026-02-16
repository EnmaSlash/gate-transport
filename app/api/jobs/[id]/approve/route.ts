import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  PaymentHoldStatus,
  TransportJobStatus,
  DecisionAction,
} from "@/lib/domain";
import { runGateEvaluation } from "@/lib/evaluateGate";
import { requireAuth, formatActor } from "@/lib/auth";
import { allowedFromFor, invalidTransitionPayload } from "@/lib/transitions";

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
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.transportJob.findUnique({
        where: { id: jobId },
        include: { gate: true, evidence: true },
      });
      if (!job) {
        return { status: 404, payload: { ok: false, error: "NotFound", detail: "Job not found" } };
      }

      const hold = await tx.paymentHold.findUnique({ where: { jobId } });
      if (!hold) {
        return { status: 404, payload: { ok: false, error: "NotFound", detail: "PaymentHold not found" } };
      }

      // Idempotent "already": job already in target state OR hold already releasable.
      if (job.status === TransportJobStatus.RELEASABLE || hold.status === PaymentHoldStatus.RELEASABLE) {
        // If hold is already releasable but job isn't, heal job status without logging.
        if (job.status !== TransportJobStatus.RELEASABLE) {
          await tx.transportJob.updateMany({
            where: { id: jobId, status: { in: allowedFromFor(TransportJobStatus.RELEASABLE) as any } },
            data: { status: TransportJobStatus.RELEASABLE },
          });
        }
        const current = await tx.transportJob.findUnique({ where: { id: jobId }, select: { status: true } });
        return {
          status: 200,
          payload: { ok: true, jobId, already: true, status: current?.status ?? TransportJobStatus.RELEASABLE },
        };
      }

      const allowedFrom = allowedFromFor(TransportJobStatus.RELEASABLE);
      if (!(allowedFrom as readonly string[]).includes(job.status)) {
        return { status: 409, payload: invalidTransitionPayload(job.status, TransportJobStatus.RELEASABLE) };
      }

      if (hold.status !== PaymentHoldStatus.HELD) {
        return {
          status: 409,
          payload: { ok: false, error: "Conflict", detail: `Cannot approve from status ${hold.status}` },
        };
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
        return {
          status: 409,
          payload: { ok: false, error: "Blocked", code: evaluation.code, missing: evaluation.missing },
        };
      }

      // Race-safe conditional updates.
      await tx.paymentHold.update({
        where: { jobId },
        data: { status: PaymentHoldStatus.RELEASABLE },
      });

      const updatedJobCount = await tx.transportJob.updateMany({
        where: { id: jobId, status: { in: allowedFrom as any } },
        data: { status: TransportJobStatus.RELEASABLE },
      });

      if (updatedJobCount.count !== 1) {
        const latest = await tx.transportJob.findUnique({ where: { id: jobId }, select: { status: true } });
        const current = latest?.status ?? "UNKNOWN";
        if (current === TransportJobStatus.RELEASABLE) {
          return { status: 200, payload: { ok: true, jobId, already: true, status: current } };
        }
        return { status: 409, payload: invalidTransitionPayload(current, TransportJobStatus.RELEASABLE) };
      }

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

      return { status: 200, payload: { ok: true, jobId } };
    });

    return NextResponse.json(result.payload, { status: result.status });
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

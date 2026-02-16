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
import { getPaymentProvider } from "@/lib/payments";

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

    const body = await req.json().catch(() => ({}));
    const requestedIdempotencyKey =
      typeof (body as any)?.idempotencyKey === "string" && (body as any).idempotencyKey.trim()
        ? String((body as any).idempotencyKey).trim()
        : null;

    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.transportJob.findUnique({
        where: { id: jobId },
        include: { gate: true, evidence: true },
      });

      if (!job) {
        return {
          status: 404,
          payload: { ok: false, error: "NotFound", detail: "Job not found" },
        };
      }

      if (job.status === TransportJobStatus.RELEASED) {
        return {
          status: 200,
          payload: { ok: true, jobId, already: true, status: job.status },
        };
      }

      const allowedFrom = allowedFromFor(TransportJobStatus.RELEASED);
      if (!(allowedFrom as readonly string[]).includes(job.status)) {
        return { status: 409, payload: invalidTransitionPayload(job.status, TransportJobStatus.RELEASED) };
      }

      const hold = await tx.paymentHold.findUnique({
        where: { jobId },
        select: { id: true, status: true, amountCents: true, rail: true, providerRef: true, provider: true, idempotencyKey: true },
      });

      if (!hold) {
        return {
          status: 404,
          payload: { ok: false, error: "NotFound", detail: "PaymentHold not found" },
        };
      }

      if (hold.status === PaymentHoldStatus.RELEASED) {
        // Heal job status if needed (previous release may have partially completed).
        await tx.transportJob.updateMany({
          where: { id: jobId, status: { in: allowedFrom as any } },
          data: { status: TransportJobStatus.RELEASED },
        });
        const current = await tx.transportJob.findUnique({ where: { id: jobId }, select: { status: true } });
        return { status: 200, payload: { ok: true, jobId, already: true, status: current?.status ?? TransportJobStatus.RELEASED } };
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

      const latestApproval = await tx.decisionLog.findFirst({
        where: { jobId, action: DecisionAction.APPROVE, reason: "manual_approval" },
        orderBy: { createdAt: "desc" },
        select: { evidenceSnapshot: true },
      });

      const maybeSnapshot = latestApproval?.evidenceSnapshot as any;
      const snapshot =
        maybeSnapshot &&
        typeof maybeSnapshot === "object" &&
        "code" in maybeSnapshot &&
        "missing" in maybeSnapshot &&
        "counts" in maybeSnapshot
          ? { code: maybeSnapshot.code, missing: maybeSnapshot.missing, counts: maybeSnapshot.counts }
          : (() => {
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
              return {
                code: evaluation.code,
                missing: evaluation.missing,
                counts: evaluation.counts,
              };
            })();

      const idempotencyKey = requestedIdempotencyKey ?? `rel_${jobId}_${hold.id}`;

      // NOTE: for now provider is noop and safe to call inside txn; for real providers
      // we will move this call outside the DB transaction and add a RELEASING state.
      const provider = getPaymentProvider();
      const providerRes = await provider.release({
        jobId,
        holdId: hold.id,
        amountCents: hold.amountCents,
        rail: String(hold.rail),
        idempotencyKey,
      });

      if (!providerRes.ok) {
        return {
          status: 502,
          payload: {
            ok: false,
            error: "PaymentProviderError",
            provider: providerRes.provider,
            idempotencyKey: providerRes.idempotencyKey,
            detail: providerRes.error,
          },
        };
      }

      await tx.paymentHold.update({
        where: { jobId },
        data: {
          status: PaymentHoldStatus.RELEASED,
          provider: providerRes.provider,
          providerRef: providerRes.providerRef,
          idempotencyKey: providerRes.idempotencyKey,
        },
      });

      const updatedJobCount = await tx.transportJob.updateMany({
        where: { id: jobId, status: { in: allowedFrom as any } },
        data: { status: TransportJobStatus.RELEASED },
      });

      if (updatedJobCount.count !== 1) {
        const latest = await tx.transportJob.findUnique({ where: { id: jobId }, select: { status: true } });
        const current = latest?.status ?? "UNKNOWN";
        if (current === TransportJobStatus.RELEASED) {
          return { status: 200, payload: { ok: true, jobId, already: true, status: current } };
        }
        return { status: 409, payload: invalidTransitionPayload(current, TransportJobStatus.RELEASED) };
      }

      await tx.decisionLog.create({
        data: {
          jobId,
          action: DecisionAction.RELEASE,
          actor,
          reason: "manual_release",
          evidenceSnapshot: {
            ...snapshot,
            provider: {
              provider: providerRes.provider,
              providerRef: providerRes.providerRef,
              idempotencyKey: providerRes.idempotencyKey,
            },
          },
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

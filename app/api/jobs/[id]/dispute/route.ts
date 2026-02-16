import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  TransportJobStatus,
  DecisionAction,
  PaymentHoldStatus,
} from "@/lib/domain";
import { requireAuth, formatActor } from "@/lib/auth";
import { allowedFromFor, invalidTransitionPayload } from "@/lib/transitions";

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

    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.transportJob.findUnique({
        where: { id },
        include: { paymentHold: true },
      });

      if (!job) {
        return { status: 404, payload: { ok: false, error: "NotFound", detail: "Job not found" } };
      }

      const warning =
        job.paymentHold?.status === PaymentHoldStatus.RELEASED
          ? "Payment already released; manual recovery may be required"
          : undefined;

      if (job.status === TransportJobStatus.DISPUTED) {
        // Avoid duplicate logs unless reason differs.
        const last = await tx.decisionLog.findFirst({
          where: { jobId: id, action: DecisionAction.DISPUTE as any },
          orderBy: { createdAt: "desc" },
          select: { reason: true },
        });
        if ((last?.reason ?? "") !== reason) {
          await tx.decisionLog.create({
            data: { jobId: id, action: DecisionAction.DISPUTE as any, actor, reason },
          });
        }
        return {
          status: 200,
          payload: { ok: true, jobId: id, already: true, status: job.status, ...(warning && { warning }) },
        };
      }

      const allowedFrom = allowedFromFor(TransportJobStatus.DISPUTED);
      if (!(allowedFrom as readonly string[]).includes(job.status)) {
        return { status: 409, payload: invalidTransitionPayload(job.status, TransportJobStatus.DISPUTED) };
      }

      const updatedCount = await tx.transportJob.updateMany({
        where: { id, status: { in: allowedFrom as any } },
        data: { status: TransportJobStatus.DISPUTED },
      });

      if (updatedCount.count !== 1) {
        const latest = await tx.transportJob.findUnique({ where: { id }, select: { status: true } });
        const current = latest?.status ?? "UNKNOWN";
        if (current === TransportJobStatus.DISPUTED) {
          return { status: 200, payload: { ok: true, jobId: id, already: true, status: current, ...(warning && { warning }) } };
        }
        return { status: 409, payload: invalidTransitionPayload(current, TransportJobStatus.DISPUTED) };
      }

      // If payment hold is releasable, freeze it back to held
      if (job.paymentHold?.status === PaymentHoldStatus.RELEASABLE) {
        await tx.paymentHold.update({
          where: { id: job.paymentHold.id },
          data: { status: PaymentHoldStatus.HELD },
        });
      }

      await tx.decisionLog.create({
        data: { jobId: id, action: DecisionAction.DISPUTE as any, actor, reason },
      });

      return {
        status: 200,
        payload: { ok: true, jobId: id, previousStatus: job.status, ...(warning && { warning }) },
      };
    });

    return NextResponse.json(result.payload, { status: result.status });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

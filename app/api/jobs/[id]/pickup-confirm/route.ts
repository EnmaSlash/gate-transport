import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TransportJobStatus, DecisionAction } from "@/lib/domain";
import { getAuthFromHeaders, requireAuth, formatActor } from "@/lib/auth";
import { requireCarrierAuth } from "@/lib/authCarrier";
import { evaluatePickupPhase } from "@/lib/evaluatePhase";
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

  const headerUser = getAuthFromHeaders(req);
  let actor: string;
  let carrier: { reason: string } | null = null;

  if (headerUser) {
    const auth = requireAuth(req);
    if (auth instanceof NextResponse) return auth;
    actor = formatActor(auth);
  } else {
    const carrierAuth = await requireCarrierAuth(req, id);
    if (carrierAuth instanceof NextResponse) return carrierAuth;
    actor = carrierAuth.actor;
    carrier = carrierAuth;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const note = typeof body?.note === "string" ? body.note : undefined;

    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.transportJob.findUnique({
        where: { id },
        select: { id: true, status: true, gateId: true },
      });

      if (!job) {
        return { status: 404, payload: { ok: false, error: "NotFound", detail: "Job not found" } };
      }

      if (job.status === TransportJobStatus.PICKUP_CONFIRMED) {
        // If caller provides a different note, allow a log entry (not a duplicate).
        if (note) {
          const last = await tx.decisionLog.findFirst({
            where: { jobId: id, action: DecisionAction.PICKUP_CONFIRM as any },
            orderBy: { createdAt: "desc" },
            select: { reason: true },
          });
          const nextReason = carrier ? `${note} | ${carrier.reason}` : note;
          if ((last?.reason ?? "") !== nextReason) {
            await tx.decisionLog.create({
              data: {
                jobId: id,
                action: DecisionAction.PICKUP_CONFIRM as any,
                actor,
                reason: nextReason,
              },
            });
          }
        }

        return { status: 200, payload: { ok: true, jobId: id, already: true, status: job.status } };
      }

      const allowedFrom = allowedFromFor(TransportJobStatus.PICKUP_CONFIRMED);
      if (!(allowedFrom as readonly string[]).includes(job.status)) {
        return { status: 409, payload: invalidTransitionPayload(job.status, TransportJobStatus.PICKUP_CONFIRMED) };
      }

      // Phase requirement enforcement (pickup).
      const gate = await tx.gate.findUnique({
        where: { id: job.gateId },
        select: {
          requirePickupPhotos: true,
          requireVin: true,
          minPickupPhotos: true,
        },
      });

      const evidence = await tx.evidence.findMany({
        where: { jobId: id, redactedAt: null },
        select: { type: true },
        take: 500,
      });
      const counts: Record<string, number> = {};
      for (const e of evidence) counts[e.type] = (counts[e.type] ?? 0) + 1;

      const phase = evaluatePickupPhase(gate, counts);
      if (!phase.pass) {
        return {
          status: 400,
          payload: { ok: false, code: "MISSING_EVIDENCE", missing: phase.missing, counts },
        };
      }

      const updatedCount = await tx.transportJob.updateMany({
        where: { id, status: { in: allowedFrom as any } },
        data: { status: TransportJobStatus.PICKUP_CONFIRMED },
      });

      if (updatedCount.count !== 1) {
        const latest = await tx.transportJob.findUnique({ where: { id }, select: { status: true } });
        const current = latest?.status ?? "UNKNOWN";
        if (current === TransportJobStatus.PICKUP_CONFIRMED) {
          return { status: 200, payload: { ok: true, jobId: id, already: true, status: current } };
        }
        return { status: 409, payload: invalidTransitionPayload(current, TransportJobStatus.PICKUP_CONFIRMED) };
      }

      await tx.decisionLog.create({
        data: {
          jobId: id,
          action: DecisionAction.PICKUP_CONFIRM as any,
          actor,
          reason: carrier
            ? (note ? `${note} | ${carrier.reason}` : carrier.reason)
            : (note ?? "pickup_confirmed"),
        },
      });

      const updated = await tx.transportJob.findUnique({ where: { id } });
      return { status: 200, payload: { ok: true, jobId: id, job: updated } };
    });

    return NextResponse.json(result.payload, { status: result.status });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

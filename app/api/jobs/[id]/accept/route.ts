import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TransportJobStatus, DecisionAction } from "@/lib/domain";
import { getAuthFromHeaders, requireAuth, formatActor } from "@/lib/auth";
import { requireCarrierAuth } from "@/lib/authCarrier";
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
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.transportJob.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!job) {
        return { status: 404, payload: { ok: false, error: "NotFound", detail: "Job not found" } };
      }

      if (job.status === TransportJobStatus.ACCEPTED) {
        return {
          status: 200,
          payload: { ok: true, jobId: id, already: true, status: job.status },
        };
      }

      const allowedFrom = allowedFromFor(TransportJobStatus.ACCEPTED);
      if (!(allowedFrom as readonly string[]).includes(job.status)) {
        return { status: 409, payload: invalidTransitionPayload(job.status, TransportJobStatus.ACCEPTED) };
      }

      const updatedCount = await tx.transportJob.updateMany({
        where: { id, status: { in: allowedFrom as any } },
        data: { status: TransportJobStatus.ACCEPTED },
      });

      if (updatedCount.count !== 1) {
        const latest = await tx.transportJob.findUnique({ where: { id }, select: { status: true } });
        const current = latest?.status ?? "UNKNOWN";
        if (current === TransportJobStatus.ACCEPTED) {
          return { status: 200, payload: { ok: true, jobId: id, already: true, status: current } };
        }
        return { status: 409, payload: invalidTransitionPayload(current, TransportJobStatus.ACCEPTED) };
      }

      await tx.decisionLog.create({
        data: {
          jobId: id,
          action: DecisionAction.ACCEPT as any,
          actor,
          reason: carrier ? carrier.reason : "carrier_accepted",
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

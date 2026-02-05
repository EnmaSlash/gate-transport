import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TransportJobStatus, DecisionAction, isValidTransition } from "@/lib/domain";

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

  try {
    const body = await req.json().catch(() => ({}));
    const actor = typeof body?.actor === "string" ? body.actor : "unknown";
    const note = typeof body?.note === "string" ? body.note : undefined;

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

    if (!isValidTransition(job.status, TransportJobStatus.PICKUP_CONFIRMED)) {
      return NextResponse.json(
        { ok: false, error: "Conflict", detail: `Cannot confirm pickup for job in status ${job.status}` },
        { status: 409 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.transportJob.update({
        where: { id },
        data: { status: TransportJobStatus.PICKUP_CONFIRMED },
      });
      await tx.decisionLog.create({
        data: {
          jobId: id,
          action: DecisionAction.PICKUP_CONFIRM as any,
          actor,
          reason: note ?? "pickup_confirmed",
        },
      });
      return result;
    });

    return NextResponse.json({ ok: true, jobId: id, job: updated });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

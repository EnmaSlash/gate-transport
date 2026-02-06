import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TransportJobStatus, DecisionAction, isValidTransition } from "@/lib/domain";
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
        { ok: false, error: "BadRequest", detail: "reason is required for cancellations" },
        { status: 400 },
      );
    }

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

    if (!isValidTransition(job.status, TransportJobStatus.CANCELLED)) {
      return NextResponse.json(
        { ok: false, error: "Conflict", detail: `Cannot cancel job in status ${job.status}` },
        { status: 409 },
      );
    }

    const previousStatus = job.status;

    await prisma.$transaction(async (tx) => {
      await tx.transportJob.update({
        where: { id },
        data: { status: TransportJobStatus.CANCELLED },
      });
      await tx.decisionLog.create({
        data: {
          jobId: id,
          action: DecisionAction.CANCEL as any,
          actor,
          reason,
        },
      });
    });

    return NextResponse.json({ ok: true, jobId: id, previousStatus });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

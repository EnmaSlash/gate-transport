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
    const body = await req.json().catch(() => ({}));
    const carrierName = typeof body?.carrierName === "string" ? body.carrierName : undefined;
    const carrierEmail = typeof body?.carrierEmail === "string" ? body.carrierEmail : undefined;

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

    if (!isValidTransition(job.status, TransportJobStatus.ASSIGNED)) {
      return NextResponse.json(
        { ok: false, error: "Conflict", detail: `Cannot assign job in status ${job.status}` },
        { status: 409 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.transportJob.update({
        where: { id },
        data: {
          status: TransportJobStatus.ASSIGNED,
          ...(carrierName !== undefined && { carrierName }),
          ...(carrierEmail !== undefined && { carrierEmail }),
        },
      });
      await tx.decisionLog.create({
        data: {
          jobId: id,
          action: DecisionAction.ASSIGN as any,
          actor,
          reason: "assignment",
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

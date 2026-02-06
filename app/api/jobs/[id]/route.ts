import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;

  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing job id in route param" },
      { status: 400 },
    );
  }

  try {
    const job = await prisma.transportJob.findUnique({
      where: { id },
      include: {
        gate: true,
        paymentHold: true,
        evidence: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });

    if (!job) {
      return NextResponse.json(
        { ok: false, error: "Job not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, job });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

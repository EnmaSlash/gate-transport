import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TransportJobStatus } from "@/lib/domain";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  if (!id || typeof id !== "string") {
    console.error("[ACCEPT] Missing or invalid id param", { id });
    return NextResponse.json(
      { error: "Missing job id in route param" },
      { status: 400 }
    );
  }

  const exists = await prisma.transportJob.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!exists) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const job = await prisma.transportJob.update({
    where: { id },
    data: { status: TransportJobStatus.ACCEPTED },
  });

  return NextResponse.json({ ok: true, job });
}

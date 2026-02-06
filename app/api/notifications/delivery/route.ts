import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DecisionAction } from "@/lib/domain";
import { requireAuth } from "@/lib/auth";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);

    const where: Record<string, unknown> = {
      action: DecisionAction.DELIVERY_SUBMIT,
    };

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        where.createdAt = { gt: sinceDate };
      }
    }

    const logs = await prisma.decisionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        job: {
          select: {
            id: true,
            vin: true,
            carrierName: true,
            pickupAddress: true,
            dropoffAddress: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      count: logs.length,
      notifications: logs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

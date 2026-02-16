import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, formatActor } from "@/lib/auth";
import { DecisionAction } from "@/lib/domain";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const actor = formatActor(auth);

  try {
    const body = await req.json().catch(() => ({}));
    const limitRaw = body?.limit;
    const limit = Math.min(Math.max(Number(limitRaw ?? 20) || 20, 1), 200);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const queued = await tx.notificationOutbox.findMany({
        where: { status: "queued" },
        orderBy: { createdAt: "asc" },
        take: limit,
      });

      for (const msg of queued) {
        await tx.notificationOutbox.update({
          where: { id: msg.id },
          data: {
            status: "sent",
            sentAt: now,
            attempts: { increment: 1 },
            lastError: null,
          },
        });

        await tx.decisionLog.create({
          data: {
            jobId: msg.jobId,
            action: DecisionAction.NOTIFICATION_SENT as any,
            actor,
            reason: msg.type,
            evidenceSnapshot: {
              outboxId: msg.id,
              type: msg.type,
              inviteId: msg.inviteId ?? null,
              toPhone: msg.toPhone ?? null,
              toEmail: msg.toEmail ?? null,
              payload: msg.payload,
            },
          },
        });
      }

      return { drained: queued.length, ids: queued.map((m) => m.id) };
    });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}


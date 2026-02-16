import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EvidenceType, DecisionAction } from "@/lib/domain";
import { getAuthFromHeaders, requireAuth, formatActor } from "@/lib/auth";
import { requireCarrierAuth } from "@/lib/authCarrier";

export const runtime = "nodejs";

const CARRIER_ALLOWED_STATUSES = new Set<string>([
  "ASSIGNED",
  "ACCEPTED",
  "PICKUP_CONFIRMED",
  "DELIVERY_SUBMITTED",
]);

type Ctx = { params: Promise<{ id: string }> };

function normalizeMessage(raw: unknown): { ok: true; message: string } | { ok: false; error: string } {
  const msg = typeof raw === "string" ? raw.trim() : "";
  if (msg.length < 5) return { ok: false, error: "Message too short (min 5 characters)" };
  if (msg.length > 1000) return { ok: false, error: "Message too long (max 1000 characters)" };
  return { ok: true, message: msg };
}

function messagePreview(message: string): string {
  const max = 140;
  if (message.length <= max) return message;
  return message.slice(0, max) + "…";
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: jobId } = await ctx.params;

  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json(
      { ok: false, error: "BadRequest", detail: "Missing job id in route param" },
      { status: 400 },
    );
  }

  const headerUser = getAuthFromHeaders(req);
  let actor: string;
  let carrier: { reason: string } | null = null;
  let isAdmin = false;

  if (headerUser) {
    const auth = requireAuth(req);
    if (auth instanceof NextResponse) return auth;
    actor = formatActor(auth);
    isAdmin = auth.role === "admin";
  } else {
    const carrierAuth = await requireCarrierAuth(req, jobId);
    if (carrierAuth instanceof NextResponse) return carrierAuth;
    actor = carrierAuth.actor;
    carrier = carrierAuth;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = normalizeMessage(body?.message);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "BadRequest", detail: parsed.error },
      { status: 400 },
    );
  }

  const job = await prisma.transportJob.findUnique({
    where: { id: jobId },
    select: { id: true, status: true },
  });
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "NotFound", detail: "Job not found" },
      { status: 404 },
    );
  }

  // Status guard: carriers can't report after RELEASED (or other terminal states).
  if (!isAdmin) {
    if (!CARRIER_ALLOWED_STATUSES.has(job.status)) {
      return NextResponse.json(
        { ok: false, error: "Conflict", detail: `Cannot report issue for job in status ${job.status}` },
        { status: 409 },
      );
    }
  }

  const notePayload = {
    kind: "issue",
    message: parsed.message,
    source: carrier ? "carrier_link" : "admin",
  };

  await prisma.$transaction(async (tx) => {
    await tx.evidence.create({
      data: {
        jobId,
        type: EvidenceType.NOTE as any,
        fileUrl: null,
        note: JSON.stringify(notePayload),
        submittedBy: actor,
      },
    });

    await tx.decisionLog.create({
      data: {
        jobId,
        action: DecisionAction.EVIDENCE_UPLOAD as any,
        actor,
        reason: carrier ? `${carrier.reason} | issue_reported` : "issue_reported",
        evidenceSnapshot: {
          issue: true,
          kind: "issue",
          messagePreview: messagePreview(parsed.message),
          source: notePayload.source,
        },
      },
    });
  });

  const allEvidence = await prisma.evidence.findMany({
    where: { jobId, redactedAt: null },
    select: { type: true },
  });
  const countsByType: Record<string, number> = {};
  for (const e of allEvidence) countsByType[e.type] = (countsByType[e.type] ?? 0) + 1;

  return NextResponse.json({ ok: true, jobId, countsByType });
}


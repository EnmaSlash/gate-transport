import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EvidenceType, isValidEvidenceType, DecisionAction } from "@/lib/domain";
import { getAuthFromHeaders, requireAuth, formatActor } from "@/lib/auth";
import { requireCarrierAuth } from "@/lib/authCarrier";

export const runtime = "nodejs";

const ALLOWED_SIM_TYPES = new Set<string>([
  EvidenceType.PICKUP_PHOTO,
  EvidenceType.DELIVERY_PHOTO,
  EvidenceType.VIN_PHOTO,
  EvidenceType.POD,
  EvidenceType.NOTE,
]);

function simEnabled(): boolean {
  const enabledByFlag = (process.env.ENABLE_SIM_EVIDENCE ?? "").toLowerCase() === "true";
  return process.env.NODE_ENV !== "production" || enabledByFlag;
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Ctx) {
  if (!simEnabled()) {
    // 404 to reduce surface area
    return NextResponse.json({ ok: false, error: "NotFound" }, { status: 404 });
  }

  const { id: jobId } = await context.params;
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });
  }

  const headerUser = getAuthFromHeaders(req);
  let submitter: string;
  let carrier: { reason: string } | null = null;

  if (headerUser) {
    const auth = requireAuth(req);
    if (auth instanceof NextResponse) return auth;
    submitter = formatActor(auth);
  } else {
    const carrierAuth = await requireCarrierAuth(req, jobId);
    if (carrierAuth instanceof NextResponse) return carrierAuth;
    submitter = carrierAuth.actor;
    carrier = carrierAuth;
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body", expected: { type: "EvidenceType" } },
      { status: 400 }
    );
  }

  const type = typeof body?.type === "string" ? body.type : "";
  const value = typeof body?.value === "string" ? body.value : null;

  if (!isValidEvidenceType(type) || !ALLOWED_SIM_TYPES.has(type)) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", detail: `type must be one of: ${Array.from(ALLOWED_SIM_TYPES).join(", ")}` },
      { status: 400 }
    );
  }

  const simulatedMeta = {
    simulated: true,
    source: "dev",
    type,
    value: value ?? undefined,
    at: new Date().toISOString(),
  };

  // Store "simulated" marker in note (existing string field).
  // We use JSON so simulated evidence is auditable without schema changes.
  const note =
    type === EvidenceType.POD
      ? JSON.stringify({ ...simulatedMeta, value: value ?? "SIMULATED_POD" })
      : type === EvidenceType.NOTE
        ? JSON.stringify({ ...simulatedMeta, value: value ?? "SIMULATED_NOTE" })
        : JSON.stringify(simulatedMeta);

  await prisma.$transaction(async (tx) => {
    await tx.evidence.create({
      data: {
        jobId,
        type: type as any,
        fileUrl: null,
        note,
        submittedBy: submitter,
      },
    });

    await tx.decisionLog.create({
      data: {
        jobId,
        action: DecisionAction.EVIDENCE_UPLOAD as any,
        actor: submitter,
        reason: carrier ? `${carrier.reason} | simulated:${type}` : `simulated:${type}`,
        evidenceSnapshot: { simulated: true, type, source: "dev" },
      },
    });
  });

  const allEvidence = await prisma.evidence.findMany({
    where: { jobId, redactedAt: null },
    select: { type: true },
  });
  const countsByType: Record<string, number> = {};
  for (const e of allEvidence) {
    countsByType[e.type] = (countsByType[e.type] ?? 0) + 1;
  }

  return NextResponse.json({ ok: true, jobId, type, inserted: 1, countsByType });
}


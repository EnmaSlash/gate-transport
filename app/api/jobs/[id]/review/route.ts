import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  EvidenceType,
  PaymentHoldStatus,
  ApprovalMode,
} from "@/lib/domain";

type EvidenceTypeCount = Record<string, number>;

function addCount(map: EvidenceTypeCount, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function getCounts(evidence: Array<{ type: string }>) {
  const counts: EvidenceTypeCount = {};
  for (const e of evidence) addCount(counts, e.type);
  return counts;
}

function buildMissing(gate: any, counts: EvidenceTypeCount, job: any) {
  const missing: string[] = [];
  if (!gate) return missing;

  const pickupCount = counts[EvidenceType.PICKUP_PHOTO] ?? 0;
  const deliveryCount = counts[EvidenceType.DELIVERY_PHOTO] ?? 0;
  const podCount = counts[EvidenceType.POD] ?? 0;

  if (gate.requirePickupPhotos) {
    const min = Number(gate.minPickupPhotos ?? 0);
    if (pickupCount < min) missing.push(`pickup_photo(${min - pickupCount} more)`);
  }

  if (gate.requireDeliveryPhotos) {
    const min = Number(gate.minDeliveryPhotos ?? 0);
    if (deliveryCount < min) missing.push(`delivery_photo(${min - deliveryCount} more)`);
  }

  if (gate.requirePod) {
    if (podCount < 1) missing.push("pod(1 required)");
  }

  if (gate.requireVin) {
    const jobVin = (job?.vin ?? "").toString().trim();
    const vinEvidenceCount = counts["vin"] ?? 0;
    const vinScanCount = counts[EvidenceType.VIN_SCAN] ?? 0;
    if (!jobVin && vinEvidenceCount < 1 && vinScanCount < 1) missing.push("vin(1 required)");
  }

  return missing;
}

export async function GET(req: Request, context: any) {
  // Next 16: context.params can be a Promise -> MUST await it
  let fromParams: string | null = null;
  try {
    const p = await context?.params;
    if (p?.id && typeof p.id === "string" && p.id.length > 0) fromParams = p.id;
  } catch {
    // ignore
  }

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // expected: /api/jobs/{id}/review => ["api","jobs","{id}","review"]
  const fromPath = parts.length >= 4 ? parts[2] : null;

  const jobId =
    (typeof fromParams === "string" && fromParams.length > 0 ? fromParams : null) ??
    (typeof fromPath === "string" && fromPath.length > 0 ? fromPath : null);

  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "Missing job id", got: null, pathname: url.pathname, parts },
      { status: 400 }
    );
  }

  try {
    const job = await prisma.transportJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ ok: false, jobId, error: "Job not found" }, { status: 404 });
    }

    const paymentHold = await prisma.paymentHold.findFirst({
      where: { jobId },
      orderBy: { createdAt: "desc" },
    });

    // Gate lookup
    let gate: any = null;
    const gateId = (job as any)?.gateId;

    if (typeof gateId === "string" && gateId.length > 0) {
      gate = await prisma.gate.findUnique({ where: { id: gateId } }).catch(() => null);
    }

    const evidence = await prisma.evidence.findMany({
      where: { jobId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, type: true, createdAt: true },
    });

    const counts = getCounts(evidence);
    const missing = buildMissing(gate, counts, job);
    const complete = missing.length === 0;

    // Don't filter by action to avoid enum mismatch bugs; use actor markers
    const latestEvaluate = await prisma.decisionLog.findFirst({
      where: { jobId, actor: "evaluate-api" },
      orderBy: { createdAt: "desc" },
    });

    const latestManualApproval = await prisma.decisionLog.findFirst({
      where: { jobId, reason: "manual_approval" },
      orderBy: { createdAt: "desc" },
    });

    const recentLogs = await prisma.decisionLog.findMany({
      where: { jobId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    let reviewState = "OPEN";
    if (complete && gate?.approvalMode === ApprovalMode.MANUAL) reviewState = "READY_FOR_REVIEW";
    if (latestManualApproval) reviewState = "APPROVED";
    if (paymentHold?.status === PaymentHoldStatus.RELEASED) reviewState = "RELEASED";

    return NextResponse.json(
      {
        ok: true,
        jobId,
        reviewState,
        job,
        gate,
        paymentHold,
        evidence: {
          total: evidence.length,
          counts,
          missing,
          complete,
          latestUploads: evidence.slice(0, 10),
        },
        evaluation: latestEvaluate
          ? {
              at: latestEvaluate.createdAt,
              reason: latestEvaluate.reason,
              actor: latestEvaluate.actor,
              action: latestEvaluate.action,
              evidenceSnapshot: latestEvaluate.evidenceSnapshot,
            }
          : null,
        manualApproval: latestManualApproval
          ? {
              at: latestManualApproval.createdAt,
              actor: latestManualApproval.actor,
              action: latestManualApproval.action,
              evidenceSnapshot: latestManualApproval.evidenceSnapshot,
            }
          : null,
        audit: { recent: recentLogs },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, jobId, error: "Review failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

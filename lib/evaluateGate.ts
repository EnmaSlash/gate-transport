import { EvidenceType } from "@/lib/domain";

/** Minimal job shape for gate evaluation. */
export type JobForEvaluate = {
  vin: string;
  deliveryDeadline: Date | null;
};

/** Minimal gate shape for gate evaluation. */
export type GateForEvaluate = {
  requirePickupPhotos: boolean;
  requireDeliveryPhotos: boolean;
  requireVin: boolean;
  requirePod: boolean;
  minPickupPhotos: number;
  minDeliveryPhotos: number;
};

/** Minimal evidence shape (type + note). */
export type EvidenceForEvaluate = Array<{ type: string; note: string | null }>;

export type GateEvaluationResult = {
  pass: boolean;
  code: string;
  missing: string[];
  counts: Record<string, number>;
};

function getCountsByType(evidence: EvidenceForEvaluate): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of evidence) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Deterministic gate evaluation: deadline → pickup photos → delivery photos → VIN (presence + match job.vin) → POD.
 * Shared by POST /api/jobs/:id/evaluate and POST /api/jobs/:id/approve.
 */
export function runGateEvaluation(
  job: JobForEvaluate,
  gate: GateForEvaluate,
  evidence: EvidenceForEvaluate
): GateEvaluationResult {
  const counts = getCountsByType(evidence);

  const pickupCount = counts[EvidenceType.PICKUP_PHOTO] ?? 0;
  const deliveryCount = counts[EvidenceType.DELIVERY_PHOTO] ?? 0;
  const vinPhotoCount = counts[EvidenceType.VIN_PHOTO] ?? 0;
  const vinScanCount = counts[EvidenceType.VIN_SCAN] ?? 0;
  const podCount = counts[EvidenceType.POD] ?? 0;
  const noteCount = counts[EvidenceType.NOTE] ?? 0;

  const missing: string[] = [];
  let code: string = "PASS";

  if (job.deliveryDeadline && new Date() > job.deliveryDeadline) {
    code = "DEADLINE_MISSED";
    missing.push("delivery_deadline_missed");
  }

  if (code === "PASS" && gate.requirePickupPhotos) {
    const min = gate.minPickupPhotos ?? 0;
    if (pickupCount < min) {
      code = "BLOCKED_MISSING_PICKUP";
      missing.push(`pickup_photo(${min - pickupCount} more)`);
    }
  }

  if (code === "PASS" && gate.requireDeliveryPhotos) {
    const min = gate.minDeliveryPhotos ?? 0;
    if (deliveryCount < min) {
      code = "BLOCKED_MISSING_DELIVERY";
      missing.push(`delivery_photo(${min - deliveryCount} more)`);
    }
  }

  if (code === "PASS" && gate.requireVin) {
    const vinPhotoEvidence = evidence.filter((e) => e.type === EvidenceType.VIN_PHOTO);
    if (vinPhotoEvidence.length === 0) {
      code = "BLOCKED_MISSING_VIN_PHOTO";
      missing.push("vin_photo(1 required)");
    }
  }

  if (code === "PASS" && gate.requirePod) {
    if (podCount < 1) {
      code = "BLOCKED_MISSING_POD";
      missing.push("pod(1 required)");
    }
  }

  const pass = code === "PASS";

  return {
    pass,
    code,
    missing,
    counts: {
      [EvidenceType.PICKUP_PHOTO]: pickupCount,
      [EvidenceType.DELIVERY_PHOTO]: deliveryCount,
      [EvidenceType.VIN_PHOTO]: vinPhotoCount,
      [EvidenceType.VIN_SCAN]: vinScanCount,
      [EvidenceType.POD]: podCount,
      [EvidenceType.NOTE]: noteCount,
    },
  };
}

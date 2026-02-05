import { Evidence, Gate, TransportJob } from "@prisma/client";
import { EvidenceType } from "@/lib/domain";

export type GateResult =
  | { ok: true; code: "PASS" }
  | { ok: false; code: string; details: Record<string, unknown> };

const count = (e: Evidence[], type: string) =>
  e.filter((x) => x.type === type).length;

const has = (e: Evidence[], type: string) => count(e, type) > 0;

export function evaluateGate(
  job: TransportJob,
  gate: Gate,
  evidence: Evidence[]
): GateResult {
  if (
    gate.requirePickupPhotos &&
    count(evidence, EvidenceType.PICKUP_PHOTO) < gate.minPickupPhotos
  ) {
    return {
      ok: false,
      code: "BLOCKED_MISSING_PICKUP",
      details: {
        required: gate.minPickupPhotos,
        present: count(evidence, EvidenceType.PICKUP_PHOTO),
      },
    };
  }

  if (
    gate.requireDeliveryPhotos &&
    count(evidence, EvidenceType.DELIVERY_PHOTO) < gate.minDeliveryPhotos
  ) {
    return {
      ok: false,
      code: "BLOCKED_MISSING_DELIVERY",
      details: {
        required: gate.minDeliveryPhotos,
        present: count(evidence, EvidenceType.DELIVERY_PHOTO),
      },
    };
  }

  if (gate.requireVin && !has(evidence, EvidenceType.VIN_SCAN)) {
    return { ok: false, code: "BLOCKED_MISSING_VIN", details: {} };
  }

  if (gate.requirePod && !has(evidence, EvidenceType.POD)) {
    return { ok: false, code: "BLOCKED_MISSING_POD", details: {} };
  }

  if (job.deliveryDeadline && new Date() > job.deliveryDeadline) {
    return {
      ok: false,
      code: "BLOCKED_LATE",
      details: { deadline: job.deliveryDeadline },
    };
  }

  return { ok: true, code: "PASS" };
}

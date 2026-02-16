import { EvidenceType } from "@/lib/domain";

export type EvidenceTypeCount = Record<string, number>;

export type PhaseEvalResult = {
  pass: boolean;
  missing: string[];
  counts: EvidenceTypeCount;
};

export type GateForPhase = {
  requirePickupPhotos?: boolean;
  requireDeliveryPhotos?: boolean;
  requireVin?: boolean;
  requirePod?: boolean;
  minPickupPhotos?: number;
  minDeliveryPhotos?: number;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function getCount(counts: EvidenceTypeCount | null | undefined, type: string): number {
  return (counts?.[type] ?? 0) as number;
}

export function evaluatePickupPhase(
  gate: GateForPhase | null | undefined,
  counts: EvidenceTypeCount | null | undefined
): PhaseEvalResult {
  const missing: string[] = [];
  if (!gate) return { pass: true, missing, counts: counts ?? {} };

  const pickupCount = getCount(counts, EvidenceType.PICKUP_PHOTO);
  const vinPhotoCount = getCount(counts, EvidenceType.VIN_PHOTO);

  if (gate.requirePickupPhotos) {
    const min = n(gate.minPickupPhotos);
    if (pickupCount < min) missing.push(`pickup_photo(${min - pickupCount} more)`);
  }

  if (gate.requireVin) {
    if (vinPhotoCount < 1) missing.push("vin_photo(1 required)");
  }

  return { pass: missing.length === 0, missing, counts: counts ?? {} };
}

export function evaluateDeliveryPhase(
  gate: GateForPhase | null | undefined,
  counts: EvidenceTypeCount | null | undefined
): PhaseEvalResult {
  const missing: string[] = [];
  if (!gate) return { pass: true, missing, counts: counts ?? {} };

  const deliveryCount = getCount(counts, EvidenceType.DELIVERY_PHOTO);
  const vinPhotoCount = getCount(counts, EvidenceType.VIN_PHOTO);
  const podCount = getCount(counts, EvidenceType.POD);

  if (gate.requireDeliveryPhotos) {
    const min = n(gate.minDeliveryPhotos);
    if (deliveryCount < min) missing.push(`delivery_photo(${min - deliveryCount} more)`);
  }

  if (gate.requireVin) {
    if (vinPhotoCount < 1) missing.push("vin_photo(1 required)");
  }

  if (gate.requirePod) {
    if (podCount < 1) missing.push("pod(1 required)");
  }

  return { pass: missing.length === 0, missing, counts: counts ?? {} };
}


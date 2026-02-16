import { describe, it, expect } from "vitest";
import { EvidenceType } from "@/lib/domain";
import { evaluatePickupPhase, evaluateDeliveryPhase } from "@/lib/evaluatePhase";

describe("evaluatePhase helpers", () => {
  it("pickup phase missing excludes delivery requirements", () => {
    const gate = {
      requirePickupPhotos: true,
      requireDeliveryPhotos: true,
      requireVin: true,
      requirePod: true,
      minPickupPhotos: 4,
      minDeliveryPhotos: 4,
    };

    const counts = {
      [EvidenceType.PICKUP_PHOTO]: 0,
      [EvidenceType.DELIVERY_PHOTO]: 0,
      [EvidenceType.VIN_PHOTO]: 0,
      [EvidenceType.POD]: 0,
    };

    const r = evaluatePickupPhase(gate, counts);
    expect(r.pass).toBe(false);
    expect(r.missing.join(", ")).toContain("pickup_photo(");
    expect(r.missing).toContain("vin_photo(1 required)");
    expect(r.missing.join(", ")).not.toContain("delivery_photo(");
    expect(r.missing).not.toContain("pod(1 required)");
  });

  it("delivery phase missing excludes pickup requirements", () => {
    const gate = {
      requirePickupPhotos: true,
      requireDeliveryPhotos: true,
      requireVin: true,
      requirePod: true,
      minPickupPhotos: 4,
      minDeliveryPhotos: 4,
    };

    const counts = {
      [EvidenceType.PICKUP_PHOTO]: 0,
      [EvidenceType.DELIVERY_PHOTO]: 0,
      [EvidenceType.VIN_PHOTO]: 0,
      [EvidenceType.POD]: 0,
    };

    const r = evaluateDeliveryPhase(gate, counts);
    expect(r.pass).toBe(false);
    expect(r.missing.join(", ")).toContain("delivery_photo(");
    expect(r.missing).toContain("vin_photo(1 required)");
    expect(r.missing).toContain("pod(1 required)");
    expect(r.missing.join(", ")).not.toContain("pickup_photo(");
  });
});


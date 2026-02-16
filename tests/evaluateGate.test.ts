import { describe, it, expect } from "vitest";
import {
  runGateEvaluation,
  JobForEvaluate,
  GateForEvaluate,
  EvidenceForEvaluate,
} from "@/lib/evaluateGate";
import { EvidenceType } from "@/lib/domain";

// ---- Helpers ----

const defaultGate: GateForEvaluate = {
  requirePickupPhotos: true,
  requireDeliveryPhotos: true,
  requireVin: true,
  requirePod: false,
  minPickupPhotos: 4,
  minDeliveryPhotos: 4,
};

const defaultJob: JobForEvaluate = {
  vin: "1HGBH41JXMN109186",
  deliveryDeadline: new Date("2099-12-31T00:00:00Z"),
};

function photos(type: string, count: number): EvidenceForEvaluate {
  return Array.from({ length: count }, () => ({ type, note: null }));
}

function vinPhoto(): EvidenceForEvaluate[number] {
  return { type: EvidenceType.VIN_PHOTO, note: null };
}

function fullEvidence(): EvidenceForEvaluate {
  return [
    ...photos(EvidenceType.PICKUP_PHOTO, 4),
    ...photos(EvidenceType.DELIVERY_PHOTO, 4),
    vinPhoto(),
  ];
}

// ---- Tests ----

describe("runGateEvaluation", () => {
  describe("PASS scenarios", () => {
    it("passes when all required evidence is present", () => {
      const result = runGateEvaluation(
        defaultJob,
        defaultGate,
        fullEvidence()
      );
      expect(result.pass).toBe(true);
      expect(result.code).toBe("PASS");
      expect(result.missing).toEqual([]);
    });

    it("passes when no gates are required", () => {
      const gate: GateForEvaluate = {
        requirePickupPhotos: false,
        requireDeliveryPhotos: false,
        requireVin: false,
        requirePod: false,
        minPickupPhotos: 0,
        minDeliveryPhotos: 0,
      };
      const result = runGateEvaluation(defaultJob, gate, []);
      expect(result.pass).toBe(true);
      expect(result.code).toBe("PASS");
    });

    it("passes with extra evidence beyond minimums", () => {
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.PICKUP_PHOTO, 10),
        ...photos(EvidenceType.DELIVERY_PHOTO, 8),
        vinPhoto(),
        { type: EvidenceType.NOTE, note: "looks good" },
      ];
      const result = runGateEvaluation(defaultJob, defaultGate, evidence);
      expect(result.pass).toBe(true);
    });

    it("passes with null deliveryDeadline", () => {
      const job: JobForEvaluate = { vin: "ABC123", deliveryDeadline: null };
      const result = runGateEvaluation(job, defaultGate, fullEvidence());
      expect(result.pass).toBe(true);
    });
  });

  describe("deadline checks", () => {
    it("fails when delivery deadline is in the past", () => {
      const job: JobForEvaluate = {
        vin: "ABC123",
        deliveryDeadline: new Date("2020-01-01T00:00:00Z"),
      };
      const result = runGateEvaluation(job, defaultGate, fullEvidence());
      expect(result.pass).toBe(false);
      expect(result.code).toBe("DEADLINE_MISSED");
      expect(result.missing).toContain("delivery_deadline_missed");
    });
  });

  describe("pickup photo checks", () => {
    it("fails with zero pickup photos", () => {
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.DELIVERY_PHOTO, 4),
        vinPhoto(),
      ];
      const result = runGateEvaluation(defaultJob, defaultGate, evidence);
      expect(result.pass).toBe(false);
      expect(result.code).toBe("BLOCKED_MISSING_PICKUP");
      expect(result.missing[0]).toMatch(/pickup_photo\(4 more\)/);
    });

    it("fails with fewer than required pickup photos", () => {
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.PICKUP_PHOTO, 2),
        ...photos(EvidenceType.DELIVERY_PHOTO, 4),
        vinPhoto(),
      ];
      const result = runGateEvaluation(defaultJob, defaultGate, evidence);
      expect(result.pass).toBe(false);
      expect(result.code).toBe("BLOCKED_MISSING_PICKUP");
      expect(result.missing[0]).toMatch(/pickup_photo\(2 more\)/);
    });

    it("skips pickup check when not required", () => {
      const gate = { ...defaultGate, requirePickupPhotos: false };
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.DELIVERY_PHOTO, 4),
        vinPhoto(),
      ];
      const result = runGateEvaluation(defaultJob, gate, evidence);
      expect(result.pass).toBe(true);
    });
  });

  describe("delivery photo checks", () => {
    it("fails with zero delivery photos", () => {
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.PICKUP_PHOTO, 4),
        vinPhoto(),
      ];
      const result = runGateEvaluation(defaultJob, defaultGate, evidence);
      expect(result.pass).toBe(false);
      expect(result.code).toBe("BLOCKED_MISSING_DELIVERY");
      expect(result.missing[0]).toMatch(/delivery_photo\(4 more\)/);
    });

    it("fails with fewer than required delivery photos", () => {
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.PICKUP_PHOTO, 4),
        ...photos(EvidenceType.DELIVERY_PHOTO, 1),
        vinPhoto(),
      ];
      const result = runGateEvaluation(defaultJob, defaultGate, evidence);
      expect(result.pass).toBe(false);
      expect(result.code).toBe("BLOCKED_MISSING_DELIVERY");
      expect(result.missing[0]).toMatch(/delivery_photo\(3 more\)/);
    });

    it("skips delivery check when not required", () => {
      const gate = { ...defaultGate, requireDeliveryPhotos: false };
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.PICKUP_PHOTO, 4),
        vinPhoto(),
      ];
      const result = runGateEvaluation(defaultJob, gate, evidence);
      expect(result.pass).toBe(true);
    });
  });

  describe("VIN checks", () => {
    it("fails when no VIN photo is present", () => {
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.PICKUP_PHOTO, 4),
        ...photos(EvidenceType.DELIVERY_PHOTO, 4),
      ];
      const result = runGateEvaluation(defaultJob, defaultGate, evidence);
      expect(result.pass).toBe(false);
      expect(result.code).toBe("BLOCKED_MISSING_VIN_PHOTO");
      expect(result.missing[0]).toMatch(/vin_photo\(1 required\)/);
    });

    it("skips VIN check when not required", () => {
      const gate = { ...defaultGate, requireVin: false };
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.PICKUP_PHOTO, 4),
        ...photos(EvidenceType.DELIVERY_PHOTO, 4),
      ];
      const result = runGateEvaluation(defaultJob, gate, evidence);
      expect(result.pass).toBe(true);
    });
  });

  describe("POD checks", () => {
    it("fails when POD is required but missing", () => {
      const gate = { ...defaultGate, requirePod: true };
      const result = runGateEvaluation(
        defaultJob,
        gate,
        fullEvidence()
      );
      expect(result.pass).toBe(false);
      expect(result.code).toBe("BLOCKED_MISSING_POD");
      expect(result.missing[0]).toMatch(/pod\(1 required\)/);
    });

    it("passes when POD is required and present", () => {
      const gate = { ...defaultGate, requirePod: true };
      const evidence: EvidenceForEvaluate = [
        ...fullEvidence(),
        { type: EvidenceType.POD, note: "signed" },
      ];
      const result = runGateEvaluation(defaultJob, gate, evidence);
      expect(result.pass).toBe(true);
    });
  });

  describe("evaluation order (first failure wins)", () => {
    it("returns DEADLINE_MISSED before checking photos", () => {
      const job: JobForEvaluate = {
        vin: "ABC123",
        deliveryDeadline: new Date("2020-01-01"),
      };
      const result = runGateEvaluation(job, defaultGate, []);
      expect(result.code).toBe("DEADLINE_MISSED");
    });

    it("returns BLOCKED_MISSING_PICKUP before delivery/vin/pod", () => {
      const result = runGateEvaluation(defaultJob, defaultGate, []);
      expect(result.code).toBe("BLOCKED_MISSING_PICKUP");
    });

    it("returns BLOCKED_MISSING_DELIVERY before vin/pod", () => {
      const evidence = photos(EvidenceType.PICKUP_PHOTO, 4);
      const result = runGateEvaluation(defaultJob, defaultGate, evidence);
      expect(result.code).toBe("BLOCKED_MISSING_DELIVERY");
    });

    it("returns BLOCKED_MISSING_VIN_PHOTO before pod", () => {
      const gate = { ...defaultGate, requirePod: true };
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.PICKUP_PHOTO, 4),
        ...photos(EvidenceType.DELIVERY_PHOTO, 4),
      ];
      const result = runGateEvaluation(defaultJob, gate, evidence);
      expect(result.code).toBe("BLOCKED_MISSING_VIN_PHOTO");
    });
  });

  describe("counts in result", () => {
    it("returns correct counts for all evidence types", () => {
      const evidence: EvidenceForEvaluate = [
        ...photos(EvidenceType.PICKUP_PHOTO, 4),
        ...photos(EvidenceType.DELIVERY_PHOTO, 4),
        vinPhoto(),
        { type: EvidenceType.POD, note: "signed" },
        { type: EvidenceType.NOTE, note: "all good" },
        { type: EvidenceType.NOTE, note: "second note" },
      ];
      const result = runGateEvaluation(defaultJob, defaultGate, evidence);
      expect(result.counts).toEqual({
        [EvidenceType.PICKUP_PHOTO]: 4,
        [EvidenceType.DELIVERY_PHOTO]: 4,
        [EvidenceType.VIN_PHOTO]: 1,
        [EvidenceType.VIN_SCAN]: 0,
        [EvidenceType.POD]: 1,
        [EvidenceType.NOTE]: 2,
      });
    });

    it("returns zero counts when no evidence", () => {
      const result = runGateEvaluation(defaultJob, defaultGate, []);
      expect(result.counts).toEqual({
        [EvidenceType.PICKUP_PHOTO]: 0,
        [EvidenceType.DELIVERY_PHOTO]: 0,
        [EvidenceType.VIN_PHOTO]: 0,
        [EvidenceType.VIN_SCAN]: 0,
        [EvidenceType.POD]: 0,
        [EvidenceType.NOTE]: 0,
      });
    });
  });
});

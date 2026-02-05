import { describe, it, expect } from "vitest";
import {
  isValidEvidenceType,
  isValidPaymentRail,
  isValidApprovalMode,
  isValidTransition,
  EvidenceType,
  PaymentRail,
  ApprovalMode,
  TransportJobStatus,
  PaymentHoldStatus,
  DecisionAction,
} from "@/lib/domain";

describe("isValidEvidenceType", () => {
  it.each(Object.values(EvidenceType))("accepts '%s'", (type) => {
    expect(isValidEvidenceType(type)).toBe(true);
  });

  it.each(["photo", "PICKUP_PHOTO", "", "unknown", "vin"])(
    "rejects '%s'",
    (type) => {
      expect(isValidEvidenceType(type)).toBe(false);
    }
  );
});

describe("isValidPaymentRail", () => {
  it.each(Object.values(PaymentRail))("accepts '%s'", (rail) => {
    expect(isValidPaymentRail(rail)).toBe(true);
  });

  it.each(["paypal", "STRIPE", "", "wire"])("rejects '%s'", (rail) => {
    expect(isValidPaymentRail(rail)).toBe(false);
  });
});

describe("isValidApprovalMode", () => {
  it.each(Object.values(ApprovalMode))("accepts '%s'", (mode) => {
    expect(isValidApprovalMode(mode)).toBe(true);
  });

  it.each(["AUTO", "MANUAL", "", "hybrid"])("rejects '%s'", (mode) => {
    expect(isValidApprovalMode(mode)).toBe(false);
  });
});

describe("enum constants", () => {
  it("TransportJobStatus has expected values", () => {
    expect(TransportJobStatus.DRAFT).toBe("DRAFT");
    expect(TransportJobStatus.CANCELLED).toBe("CANCELLED");
    expect(TransportJobStatus.RELEASED).toBe("RELEASED");
    expect(TransportJobStatus.DISPUTED).toBe("DISPUTED");
    expect(TransportJobStatus.RELEASABLE).toBe("RELEASABLE");
  });

  it("PaymentHoldStatus has expected values", () => {
    expect(PaymentHoldStatus.HELD).toBe("held");
    expect(PaymentHoldStatus.RELEASABLE).toBe("releasable");
    expect(PaymentHoldStatus.RELEASED).toBe("released");
  });

  it("DecisionAction has lifecycle values", () => {
    expect(DecisionAction.ASSIGN).toBe("assign");
    expect(DecisionAction.ACCEPT).toBe("accept");
    expect(DecisionAction.PICKUP_CONFIRM).toBe("pickup_confirm");
    expect(DecisionAction.DELIVERY_SUBMIT).toBe("delivery_submit");
  });
});

describe("isValidTransition", () => {
  describe("happy path — linear lifecycle", () => {
    it.each([
      ["DRAFT", "ASSIGNED"],
      ["ASSIGNED", "ACCEPTED"],
      ["ACCEPTED", "PICKUP_CONFIRMED"],
      ["PICKUP_CONFIRMED", "DELIVERY_SUBMITTED"],
      ["DELIVERY_SUBMITTED", "RELEASABLE"],
      ["RELEASABLE", "RELEASED"],
    ] as const)("%s → %s is valid", (from, to) => {
      expect(isValidTransition(from, TransportJobStatus[to])).toBe(true);
    });
  });

  describe("dispute — allowed from operational states", () => {
    it.each([
      "ACCEPTED",
      "PICKUP_CONFIRMED",
      "DELIVERY_SUBMITTED",
      "RELEASABLE",
      "RELEASED",
    ] as const)("%s → DISPUTED is valid", (from) => {
      expect(isValidTransition(from, TransportJobStatus.DISPUTED)).toBe(true);
    });

    it.each(["DRAFT", "ASSIGNED", "CANCELLED", "DISPUTED"] as const)(
      "%s → DISPUTED is invalid",
      (from) => {
        expect(isValidTransition(from, TransportJobStatus.DISPUTED)).toBe(false);
      },
    );
  });

  describe("cancel — allowed before release", () => {
    it.each([
      "DRAFT",
      "ASSIGNED",
      "ACCEPTED",
      "PICKUP_CONFIRMED",
      "DELIVERY_SUBMITTED",
      "RELEASABLE",
    ] as const)("%s → CANCELLED is valid", (from) => {
      expect(isValidTransition(from, TransportJobStatus.CANCELLED)).toBe(true);
    });

    it.each(["RELEASED", "DISPUTED", "CANCELLED"] as const)(
      "%s → CANCELLED is invalid",
      (from) => {
        expect(isValidTransition(from, TransportJobStatus.CANCELLED)).toBe(false);
      },
    );
  });

  describe("invalid transitions", () => {
    it("cannot skip states (DRAFT → ACCEPTED)", () => {
      expect(isValidTransition("DRAFT", TransportJobStatus.ACCEPTED)).toBe(false);
    });

    it("cannot go backwards (ACCEPTED → ASSIGNED)", () => {
      expect(isValidTransition("ACCEPTED", TransportJobStatus.ASSIGNED)).toBe(false);
    });

    it("cannot transition from terminal DISPUTED", () => {
      expect(isValidTransition("DISPUTED", TransportJobStatus.RELEASED)).toBe(false);
    });

    it("cannot transition from terminal CANCELLED", () => {
      expect(isValidTransition("CANCELLED", TransportJobStatus.DRAFT)).toBe(false);
    });

    it("DRAFT has no valid inbound transitions", () => {
      expect(isValidTransition("ASSIGNED", TransportJobStatus.DRAFT)).toBe(false);
    });

    it("returns false for unknown status", () => {
      expect(isValidTransition("UNKNOWN", TransportJobStatus.ACCEPTED)).toBe(false);
    });
  });
});

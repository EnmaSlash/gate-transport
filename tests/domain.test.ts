import { describe, it, expect } from "vitest";
import {
  isValidEvidenceType,
  isValidPaymentRail,
  isValidApprovalMode,
  EvidenceType,
  PaymentRail,
  ApprovalMode,
  TransportJobStatus,
  PaymentHoldStatus,
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
});

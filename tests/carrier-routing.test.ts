import { describe, it, expect } from "vitest";
import { carrierStepForStatus, carrierPath } from "@/app/c/_lib/routing";

describe("carrier token-native routing", () => {
  it("maps status to step", () => {
    expect(carrierStepForStatus("ASSIGNED")).toBe("pickup");
    expect(carrierStepForStatus("ACCEPTED")).toBe("pickup");
    expect(carrierStepForStatus("PICKUP_CONFIRMED")).toBe("status");
    expect(carrierStepForStatus("DELIVERY_SUBMITTED")).toBe("status");
    expect(carrierStepForStatus("RELEASABLE")).toBe("status");
  });

  it("builds /c/<token> paths", () => {
    expect(carrierPath("abc")).toBe("/c/abc");
    expect(carrierPath("a b", "pickup")).toBe("/c/a%20b/pickup");
  });
});


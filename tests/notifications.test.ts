import { describe, it, expect } from "vitest";
import { checkAuthorization } from "@/lib/authorization";
import { type AuthUser } from "@/lib/auth";

function makeUser(role: "admin" | "shipper" | "carrier"): AuthUser {
  return { userId: "u1", email: "test@test.com", role, authMethod: "jwt" };
}

describe("notification permissions", () => {
  it("admin can access delivery notifications", () => {
    expect(
      checkAuthorization("GET", "/api/notifications/delivery", makeUser("admin")).allowed,
    ).toBe(true);
  });

  it("shipper can access delivery notifications", () => {
    expect(
      checkAuthorization("GET", "/api/notifications/delivery", makeUser("shipper")).allowed,
    ).toBe(true);
  });

  it("carrier cannot access delivery notifications", () => {
    expect(
      checkAuthorization("GET", "/api/notifications/delivery", makeUser("carrier")).allowed,
    ).toBe(false);
  });
});

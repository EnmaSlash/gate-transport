import { describe, it, expect } from "vitest";
import { normalizeRoutePath, checkAuthorization } from "@/lib/authorization";
import { type AuthUser } from "@/lib/auth";

function makeUser(role: "admin" | "shipper" | "carrier"): AuthUser {
  return { userId: "u1", email: "test@test.com", role, authMethod: "jwt" };
}

describe("normalizeRoutePath", () => {
  it("replaces UUIDs with [id]", () => {
    expect(
      normalizeRoutePath("/api/jobs/550e8400-e29b-41d4-a716-446655440000/approve"),
    ).toBe("/api/jobs/[id]/approve");
  });

  it("handles multiple UUIDs", () => {
    expect(
      normalizeRoutePath("/api/admin/users/550e8400-e29b-41d4-a716-446655440000/keys"),
    ).toBe("/api/admin/users/[id]/keys");
  });

  it("leaves non-UUID segments alone", () => {
    expect(normalizeRoutePath("/api/jobs")).toBe("/api/jobs");
  });
});

describe("checkAuthorization", () => {
  describe("admin has access to everything", () => {
    const admin = makeUser("admin");

    it.each([
      ["GET", "/api/jobs"],
      ["POST", "/api/jobs"],
      ["GET", "/api/jobs/550e8400-e29b-41d4-a716-446655440000"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/assign"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/accept"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/release"],
      ["POST", "/api/admin/users"],
      ["POST", "/api/admin/outbox/drain"],
      ["GET", "/api/admin/users"],
      ["GET", "/api/notifications/delivery"],
    ])("%s %s → allowed", (method, path) => {
      expect(checkAuthorization(method, path, admin).allowed).toBe(true);
    });
  });

  describe("shipper permissions", () => {
    const shipper = makeUser("shipper");

    it.each([
      ["GET", "/api/jobs"],
      ["POST", "/api/jobs"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/assign"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/approve"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/dispute"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/cancel"],
      ["GET", "/api/notifications/delivery"],
    ])("%s %s → allowed", (method, path) => {
      expect(checkAuthorization(method, path, shipper).allowed).toBe(true);
    });

    it.each([
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/accept"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/pickup-confirm"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/delivery-submit"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/evidence"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/release"],
      ["POST", "/api/admin/users"],
      ["POST", "/api/admin/outbox/drain"],
    ])("%s %s → denied", (method, path) => {
      expect(checkAuthorization(method, path, shipper).allowed).toBe(false);
    });
  });

  describe("carrier permissions", () => {
    const carrier = makeUser("carrier");

    it.each([
      ["GET", "/api/jobs"],
      ["GET", "/api/jobs/550e8400-e29b-41d4-a716-446655440000"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/accept"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/pickup-confirm"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/delivery-submit"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/evidence"],
    ])("%s %s → allowed", (method, path) => {
      expect(checkAuthorization(method, path, carrier).allowed).toBe(true);
    });

    it.each([
      ["POST", "/api/jobs"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/assign"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/approve"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/release"],
      ["POST", "/api/jobs/550e8400-e29b-41d4-a716-446655440000/dispute"],
      ["POST", "/api/admin/users"],
      ["POST", "/api/admin/outbox/drain"],
      ["GET", "/api/notifications/delivery"],
    ])("%s %s → denied", (method, path) => {
      expect(checkAuthorization(method, path, carrier).allowed).toBe(false);
    });
  });

  it("denies unknown routes (fail-closed)", () => {
    const admin = makeUser("admin");
    expect(
      checkAuthorization("DELETE", "/api/jobs/550e8400-e29b-41d4-a716-446655440000", admin).allowed,
    ).toBe(false);
  });

  it("returns requiredRoles on denial", () => {
    const carrier = makeUser("carrier");
    const result = checkAuthorization(
      "POST",
      "/api/jobs/550e8400-e29b-41d4-a716-446655440000/release",
      carrier,
    );
    expect(result.allowed).toBe(false);
    expect(result.requiredRoles).toContain("admin");
  });
});

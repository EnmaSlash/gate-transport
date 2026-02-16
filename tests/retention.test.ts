import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getRetentionDays, isExpired } from "@/lib/domain";
import { checkAuthorization } from "@/lib/authorization";
import { type AuthUser } from "@/lib/auth";

function makeUser(role: "admin" | "shipper" | "carrier"): AuthUser {
  return { userId: "u1", email: "test@test.com", role, authMethod: "jwt" };
}

const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";
const EVIDENCE_UUID = "660e8400-e29b-41d4-a716-446655440000";

// ----- Retention helpers -----

describe("getRetentionDays", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 30 for pickup_photo by default", () => {
    delete process.env.RETENTION_DAYS_PHOTOS;
    expect(getRetentionDays("pickup_photo")).toBe(30);
  });

  it("returns 30 for delivery_photo by default", () => {
    delete process.env.RETENTION_DAYS_PHOTOS;
    expect(getRetentionDays("delivery_photo")).toBe(30);
  });

  it("returns 30 for vin_photo by default", () => {
    delete process.env.RETENTION_DAYS_PHOTOS;
    expect(getRetentionDays("vin_photo")).toBe(30);
  });

  it("returns 90 for vin_scan by default (text evidence)", () => {
    delete process.env.RETENTION_DAYS_TEXT;
    expect(getRetentionDays("vin_scan")).toBe(90);
  });

  it("returns 90 for pod by default", () => {
    delete process.env.RETENTION_DAYS_TEXT;
    expect(getRetentionDays("pod")).toBe(90);
  });

  it("respects RETENTION_DAYS_PHOTOS env var", () => {
    process.env.RETENTION_DAYS_PHOTOS = "7";
    expect(getRetentionDays("pickup_photo")).toBe(7);
  });

  it("respects RETENTION_DAYS_TEXT env var", () => {
    process.env.RETENTION_DAYS_TEXT = "180";
    expect(getRetentionDays("vin_scan")).toBe(180);
  });
});

describe("isExpired", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RETENTION_DAYS_PHOTOS = "30";
    process.env.RETENTION_DAYS_TEXT = "90";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns false for recent photo", () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    expect(isExpired("pickup_photo", recent)).toBe(false);
  });

  it("returns true for old photo", () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
    expect(isExpired("pickup_photo", old)).toBe(true);
  });

  it("returns false for recent text", () => {
    const recent = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    expect(isExpired("vin_scan", recent)).toBe(false);
  });

  it("returns true for old text", () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000); // 91 days ago
    expect(isExpired("vin_scan", old)).toBe(true);
  });

  it("boundary: exactly at retention is not expired", () => {
    // 30 days ago exactly — still within window
    const boundary = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 1000);
    expect(isExpired("delivery_photo", boundary)).toBe(false);
  });
});

// ----- Redact endpoint authorization -----

describe("redact endpoint authorization", () => {
  const redactPath = `/api/jobs/${TEST_UUID}/evidence/${EVIDENCE_UUID}/redact`;

  it("admin can redact", () => {
    expect(checkAuthorization("POST", redactPath, makeUser("admin")).allowed).toBe(true);
  });

  it("shipper cannot redact", () => {
    expect(checkAuthorization("POST", redactPath, makeUser("shipper")).allowed).toBe(false);
  });

  it("carrier cannot redact", () => {
    expect(checkAuthorization("POST", redactPath, makeUser("carrier")).allowed).toBe(false);
  });
});

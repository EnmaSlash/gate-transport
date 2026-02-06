import { describe, it, expect } from "vitest";
import {
  signJwt,
  verifyJwt,
  hashApiKey,
  generateApiKey,
  getKeyPrefix,
  formatActor,
  getAuthFromHeaders,
  type AuthUser,
} from "@/lib/auth";

// Set env vars for tests
process.env.JWT_SECRET = "test_secret_that_is_at_least_32_bytes_long_for_hs256";
process.env.JWT_ISSUER = "gate-transport";
process.env.JWT_EXPIRY_HOURS = "1";

describe("JWT", () => {
  const testUser = { id: "user-123", email: "test@example.com", role: "admin" as const };

  it("signJwt returns a string token", async () => {
    const token = await signJwt(testUser);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("verifyJwt roundtrips with signJwt", async () => {
    const token = await signJwt(testUser);
    const claims = await verifyJwt(token);
    expect(claims.sub).toBe("user-123");
    expect(claims.email).toBe("test@example.com");
    expect(claims.role).toBe("admin");
  });

  it("verifyJwt rejects tampered token", async () => {
    const token = await signJwt(testUser);
    const tampered = token.slice(0, -5) + "XXXXX";
    await expect(verifyJwt(tampered)).rejects.toThrow();
  });

  it("verifyJwt rejects garbage input", async () => {
    await expect(verifyJwt("not.a.jwt")).rejects.toThrow();
  });
});

describe("API Key", () => {
  it("generateApiKey returns gk_ prefixed 35-char string", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^gk_[0-9a-f]{32}$/);
    expect(key).toHaveLength(35);
  });

  it("generateApiKey produces unique keys", () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
    expect(keys.size).toBe(10);
  });

  it("hashApiKey returns consistent 64-char hex", async () => {
    const hash1 = await hashApiKey("gk_test123");
    const hash2 = await hashApiKey("gk_test123");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashApiKey differs for different inputs", async () => {
    const hash1 = await hashApiKey("gk_aaa");
    const hash2 = await hashApiKey("gk_bbb");
    expect(hash1).not.toBe(hash2);
  });

  it("getKeyPrefix returns first 8 chars", () => {
    expect(getKeyPrefix("gk_abcdef1234567890")).toBe("gk_abcde");
  });
});

describe("formatActor", () => {
  it("formats as user:id:email", () => {
    const user: AuthUser = {
      userId: "abc-123",
      email: "test@example.com",
      role: "shipper",
      authMethod: "jwt",
    };
    expect(formatActor(user)).toBe("user:abc-123:test@example.com");
  });
});

describe("getAuthFromHeaders", () => {
  it("returns AuthUser when all headers present", () => {
    const headers = new Headers({
      "x-auth-user-id": "user-1",
      "x-auth-user-email": "a@b.com",
      "x-auth-user-role": "carrier",
      "x-auth-method": "api_key",
    });
    const req = new Request("http://localhost", { headers });
    const user = getAuthFromHeaders(req);
    expect(user).toEqual({
      userId: "user-1",
      email: "a@b.com",
      role: "carrier",
      authMethod: "api_key",
    });
  });

  it("returns null when headers missing", () => {
    const req = new Request("http://localhost");
    expect(getAuthFromHeaders(req)).toBeNull();
  });

  it("returns null when partial headers", () => {
    const headers = new Headers({ "x-auth-user-id": "user-1" });
    const req = new Request("http://localhost", { headers });
    expect(getAuthFromHeaders(req)).toBeNull();
  });
});

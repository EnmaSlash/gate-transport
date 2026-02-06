import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { NextResponse } from "next/server";
import { type UserRole } from "@prisma/client";
import { checkAuthorization, forbidden } from "./authorization";

// ----- Types -----

export type AuthUser = {
  userId: string;
  email: string;
  role: UserRole;
  authMethod: "jwt" | "api_key";
};

export type JwtClaims = JWTPayload & {
  sub: string;
  email: string;
  role: UserRole;
};

// ----- JWT -----

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

const JWT_ISSUER = process.env.JWT_ISSUER ?? "gate-transport";
const JWT_EXPIRY = process.env.JWT_EXPIRY_HOURS ?? "24";

export async function signJwt(user: {
  id: string;
  email: string;
  role: UserRole;
}): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${JWT_EXPIRY}h`)
    .sign(getJwtSecret());
}

export async function verifyJwt(token: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    issuer: JWT_ISSUER,
  });
  return payload as JwtClaims;
}

// ----- API Key -----

export async function hashApiKey(rawKey: string): Promise<string> {
  const data = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `gk_${hex}`;
}

export function getKeyPrefix(rawKey: string): string {
  return rawKey.substring(0, 8);
}

// ----- Request auth helpers -----

export function getAuthFromHeaders(req: Request): AuthUser | null {
  const userId = req.headers.get("x-auth-user-id");
  const email = req.headers.get("x-auth-user-email");
  const role = req.headers.get("x-auth-user-role") as UserRole | null;
  const method = req.headers.get("x-auth-method") as "jwt" | "api_key" | null;

  if (!userId || !email || !role || !method) return null;

  return { userId, email, role, authMethod: method };
}

export function formatActor(user: AuthUser): string {
  return `user:${user.userId}:${user.email}`;
}

export function requireAuth(req: Request): AuthUser | NextResponse {
  const user = getAuthFromHeaders(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", detail: "Not authenticated" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const { allowed, requiredRoles } = checkAuthorization(
    req.method,
    url.pathname,
    user,
  );
  if (!allowed) {
    return forbidden(requiredRoles);
  }

  return user;
}

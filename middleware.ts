import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

export const runtime = "nodejs";

const PUBLIC_PATHS = new Set(["/api/auth/login"]);

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Try JWT
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, getJwtSecret(), {
        issuer: process.env.JWT_ISSUER ?? "gate-transport",
      });
      const headers = new Headers(request.headers);
      headers.set("x-auth-user-id", payload.sub ?? "");
      headers.set("x-auth-user-email", (payload as any).email ?? "");
      headers.set("x-auth-user-role", (payload as any).role ?? "");
      headers.set("x-auth-method", "jwt");
      return NextResponse.next({ request: { headers } });
    } catch {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", detail: "Invalid or expired JWT" },
        { status: 401 },
      );
    }
  }

  // Try API key
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) {
    try {
      const { hashApiKey } = await import("@/lib/auth");
      const { prisma } = await import("@/lib/prisma");

      const keyHash = await hashApiKey(apiKey);
      const record = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: {
          user: { select: { id: true, email: true, role: true, active: true } },
        },
      });

      if (!record || !record.active || !record.user.active) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized", detail: "Invalid or inactive API key" },
          { status: 401 },
        );
      }
      if (record.expiresAt && record.expiresAt < new Date()) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized", detail: "API key expired" },
          { status: 401 },
        );
      }

      // Fire-and-forget: update lastUsedAt
      prisma.apiKey
        .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});

      const headers = new Headers(request.headers);
      headers.set("x-auth-user-id", record.user.id);
      headers.set("x-auth-user-email", record.user.email);
      headers.set("x-auth-user-role", record.user.role);
      headers.set("x-auth-method", "api_key");
      return NextResponse.next({ request: { headers } });
    } catch {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", detail: "API key verification failed" },
        { status: 401 },
      );
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Unauthorized",
      detail: "Missing Authorization header or X-Api-Key header",
    },
    { status: 401 },
  );
}

export const config = {
  matcher: ["/api/:path*"],
};

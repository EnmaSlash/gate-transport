import { NextResponse } from "next/server";
import { hashApiKey, signJwt } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const rawKey = body?.apiKey;

    if (!rawKey || typeof rawKey !== "string") {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "apiKey is required" },
        { status: 400 },
      );
    }

    const keyHash = await hashApiKey(rawKey);
    const record = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!record || !record.active || !record.user.active) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", detail: "Invalid API key" },
        { status: 401 },
      );
    }
    if (record.expiresAt && record.expiresAt < new Date()) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", detail: "API key expired" },
        { status: 401 },
      );
    }

    const token = await signJwt({
      id: record.user.id,
      email: record.user.email,
      role: record.user.role,
    });

    return NextResponse.json({
      ok: true,
      token,
      expiresInHours: Number(process.env.JWT_EXPIRY_HOURS ?? 24),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

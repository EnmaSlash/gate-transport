import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/auth";

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
        apiKeys: {
          select: { id: true, keyPrefix: true, label: true, active: true, createdAt: true, lastUsedAt: true },
        },
      },
    });

    return NextResponse.json({ ok: true, users });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "Body must be valid JSON" },
        { status: 400 },
      );
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role = body.role;

    if (!email || !name) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "email and name are required" },
        { status: 400 },
      );
    }

    const validRoles = ["admin", "shipper", "carrier"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: `role must be one of: ${validRoles.join(", ")}` },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Conflict", detail: "A user with this email already exists" },
        { status: 409 },
      );
    }

    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        role,
        apiKeys: {
          create: {
            keyHash,
            keyPrefix: getKeyPrefix(rawKey),
            label: "initial",
          },
        },
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      user,
      apiKey: rawKey,
      warning: "Save this API key now. It cannot be retrieved later.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

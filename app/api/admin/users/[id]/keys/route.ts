import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/auth";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id: userId } = await ctx.params;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json(
      { ok: false, error: "BadRequest", detail: "Missing user id" },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "NotFound", detail: "User not found" },
        { status: 404 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const label = typeof body?.label === "string" ? body.label.trim() : "";

    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        keyHash,
        keyPrefix: getKeyPrefix(rawKey),
        label,
      },
      select: { id: true, keyPrefix: true, label: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      apiKey: rawKey,
      keyRecord: apiKey,
      warning: "Save this API key now. It cannot be retrieved later.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

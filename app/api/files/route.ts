import { NextResponse } from "next/server";
import { extname } from "node:path";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getObject } from "@/lib/r2";
import { isExpired } from "@/lib/domain";

export const runtime = "nodejs";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const DRIVE_LETTER_RE = /^[a-zA-Z]:/;

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key || typeof key !== "string") {
    return NextResponse.json(
      { ok: false, error: "BadRequest", detail: "key query parameter is required" },
      { status: 400 },
    );
  }

  // Validate key format
  if (!key.startsWith("uploads/")) {
    return NextResponse.json(
      { ok: false, error: "BadRequest", detail: "key must start with uploads/" },
      { status: 400 },
    );
  }
  if (key.includes("..") || DRIVE_LETTER_RE.test(key)) {
    return NextResponse.json(
      { ok: false, error: "BadRequest", detail: "Invalid key" },
      { status: 400 },
    );
  }

  // Derive jobId: uploads/<jobId>/<filename>
  const parts = key.split("/");
  if (parts.length < 3 || !parts[1]) {
    return NextResponse.json(
      { ok: false, error: "BadRequest", detail: "Invalid key format" },
      { status: 400 },
    );
  }
  const jobId = parts[1];

  // Verify job exists
  const job = await prisma.transportJob.findUnique({
    where: { id: jobId },
    select: { id: true },
  });
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "NotFound", detail: "Job not found" },
      { status: 404 },
    );
  }

  // Check if evidence is redacted or expired
  const evidence = await prisma.evidence.findFirst({
    where: { jobId, fileUrl: key },
    select: { id: true, type: true, redactedAt: true, createdAt: true },
  });

  if (evidence?.redactedAt) {
    return NextResponse.json(
      { ok: false, error: "Gone", detail: "Evidence has been redacted" },
      { status: 410 },
    );
  }

  if (evidence && isExpired(evidence.type, evidence.createdAt)) {
    return NextResponse.json(
      { ok: false, error: "Expired", detail: "Evidence expired per retention policy" },
      { status: 410 },
    );
  }

  // Check file extension
  const ext = extname(key).toLowerCase();
  const contentType = MIME_MAP[ext];
  if (!contentType) {
    return NextResponse.json(
      { ok: false, error: "BadRequest", detail: `Unsupported file type: ${ext}` },
      { status: 400 },
    );
  }

  // Fetch from R2
  try {
    const obj = await getObject({ key });

    return new NextResponse(obj.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...(obj.contentLength > 0 ? { "Content-Length": String(obj.contentLength) } : {}),
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return NextResponse.json(
        { ok: false, error: "NotFound", detail: "File not found in storage" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Failed to fetch file" },
      { status: 500 },
    );
  }
}

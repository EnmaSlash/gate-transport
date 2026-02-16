import { NextResponse } from "next/server";
import { getAuthFromHeaders, requireAuth } from "@/lib/auth";
import { requireCarrierAuth } from "@/lib/authCarrier";
import { putObject } from "@/lib/r2";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const jobId = formData.get("jobId") as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "file field is required" },
        { status: 400 },
      );
    }
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "jobId field is required" },
        { status: 400 },
      );
    }

    const headerUser = getAuthFromHeaders(req);
    const carrier = headerUser ? null : await requireCarrierAuth(req, jobId);
    if (carrier instanceof NextResponse) return carrier;
    const auth = headerUser ? requireAuth(req) : null;
    if (auth instanceof NextResponse) return auth;

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "File exceeds 10 MB limit" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: `Invalid file type: ${file.type}. Allowed: jpg, png, webp` },
        { status: 400 },
      );
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${timestamp}-${safeName}`;
    const storageKey = `uploads/${jobId}/${filename}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await putObject({ key: storageKey, contentType: file.type, body: buffer });

    return NextResponse.json({
      ok: true,
      storageKey,
      filename: file.name,
      bytes: file.size,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

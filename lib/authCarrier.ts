import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/carrierInvite";

export type CarrierAuthContext = {
  jobId: string;
  inviteId: string;
  actor: "carrier_link";
  reason: string;
};

export function extractCarrierToken(req: Request): string | null {
  const authz = req.headers.get("authorization") || req.headers.get("Authorization");
  if (authz) {
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }

  try {
    const url = new URL(req.url);
    const t = url.searchParams.get("t");
    if (t && t.trim()) return t.trim();
  } catch {
    // ignore
  }

  return null;
}

export async function requireCarrierAuth(
  req: Request,
  expectedJobId?: string,
): Promise<CarrierAuthContext | NextResponse> {
  const rawToken = extractCarrierToken(req);
  if (!rawToken) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "CARRIER_TOKEN_REQUIRED" },
      { status: 401 },
    );
  }

  const verified = await verifyToken(rawToken);
  if (!verified.ok) {
    return NextResponse.json(
      { ok: false, error: "NotFound", code: `CARRIER_INVITE_${verified.code.toUpperCase()}` },
      { status: 404 },
    );
  }

  if (expectedJobId && verified.jobId !== expectedJobId) {
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "CARRIER_INVITE_JOB_SCOPE" },
      { status: 403 },
    );
  }

  return {
    jobId: verified.jobId,
    inviteId: verified.inviteId,
    actor: "carrier_link",
    reason: `carrier_link inviteId=${verified.inviteId}`,
  };
}


import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export type CarrierInviteStatus =
  | { ok: true; inviteId: string; jobId: string }
  | { ok: false; code: "invalid" | "revoked" | "expired" };

export function generateRawToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://127.0.0.1:3010";
}

export async function verifyToken(rawToken: string): Promise<CarrierInviteStatus> {
  if (!rawToken || typeof rawToken !== "string") return { ok: false, code: "invalid" };
  const tokenHash = hashToken(rawToken);

  const invite = await prisma.carrierInvite.findUnique({
    where: { tokenHash },
    select: { id: true, jobId: true, revokedAt: true, expiresAt: true },
  });

  if (!invite) return { ok: false, code: "invalid" };
  if (invite.revokedAt) return { ok: false, code: "revoked" };
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return { ok: false, code: "expired" };

  return { ok: true, inviteId: invite.id, jobId: invite.jobId };
}


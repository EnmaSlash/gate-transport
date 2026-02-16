import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/carrierInvite";

export type ResolvedCarrierToken =
  | { ok: true; jobId: string }
  | { ok: false; code: "invalid" | "expired" | "revoked" };

export async function resolveCarrierTokenToJobId(rawToken: string): Promise<ResolvedCarrierToken> {
  if (!rawToken || typeof rawToken !== "string") return { ok: false, code: "invalid" };
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const invite = await prisma.carrierInvite.findUnique({
    where: { tokenHash },
    select: { id: true, jobId: true, revokedAt: true, expiresAt: true },
  });

  if (!invite) return { ok: false, code: "invalid" };
  if (invite.revokedAt) return { ok: false, code: "revoked" };
  if (invite.expiresAt && invite.expiresAt.getTime() < now.getTime()) return { ok: false, code: "expired" };

  await prisma.carrierInvite.update({
    where: { id: invite.id },
    data: {
      lastUsedAt: now,
      useCount: { increment: 1 },
    },
  });

  return { ok: true, jobId: invite.jobId };
}

